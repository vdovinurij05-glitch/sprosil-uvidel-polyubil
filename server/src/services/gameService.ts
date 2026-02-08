import { prisma } from '../utils/db';
import { logger } from '../utils/logger';
import { config } from '../config';
import { containsToxicContent, sanitizeText } from '../utils/moderation';

type Gender = 'male' | 'female';
type SessionStatus = 'lobby' | 'roster' | 'qa_rounds' | 'voting' | 'results' | 'closed';

export interface SessionPlayer {
  userId: string;
  telegramId: number;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
  gender: string;
}

export interface SessionState {
  id: string;
  status: string;
  currentRound: number;
  totalRounds: number;
  males: SessionPlayer[];
  females: SessionPlayer[];
  currentQuestion?: {
    id: string;
    text: string;
    authorId: string;
    round: number;
  };
  answers?: {
    id: string;
    authorId: string;
    text: string;
  }[];
  timeRemaining?: number;
}

// In-memory lobby timers
const lobbyTimers = new Map<string, NodeJS.Timeout>();

export class GameService {
  private onSessionUpdate: ((sessionId: string, state: SessionState) => void) | null = null;
  private onLobbyTimeout: ((sessionId: string) => void) | null = null;

  setCallbacks(callbacks: {
    onSessionUpdate: (sessionId: string, state: SessionState) => void;
    onLobbyTimeout: (sessionId: string) => void;
  }) {
    this.onSessionUpdate = callbacks.onSessionUpdate;
    this.onLobbyTimeout = callbacks.onLobbyTimeout;
  }

  async joinLobby(userId: string, questionText: string): Promise<{ sessionId: string; state: SessionState }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.gender) {
      throw new Error('User must set gender before joining');
    }

    const sanitized = sanitizeText(questionText);
    if (!sanitized || sanitized.length < 3) {
      throw new Error('Question is too short');
    }
    if (containsToxicContent(sanitized)) {
      throw new Error('Question contains inappropriate content');
    }

    // Check if user already in an active session
    const existing = await prisma.sessionParticipant.findFirst({
      where: {
        userId,
        session: { status: { in: ['lobby', 'roster', 'qa_rounds', 'voting'] } },
      },
      include: { session: true },
    });
    if (existing) {
      throw new Error('Already in an active session');
    }

    // Find or create lobby session
    let session = await this.findOpenLobby(user.gender);
    if (!session) {
      session = await prisma.session.create({ data: {} });
      logger.info('New lobby created', { sessionId: session.id });
      this.startLobbyTimer(session.id);
    }

    // Join session
    await prisma.sessionParticipant.create({
      data: { sessionId: session.id, userId },
    });

    // Save question
    const participants = await this.getSessionParticipants(session.id);
    const round = participants.filter(p => p.gender === user.gender).length;

    await prisma.question.create({
      data: {
        sessionId: session.id,
        authorId: userId,
        text: sanitized,
        round,
      },
    });

    logger.info('Player joined lobby', {
      sessionId: session.id,
      userId,
      gender: user.gender,
    });

    // Check if session can start
    const state = await this.getSessionState(session.id);
    const maleCount = state.males.length;
    const femaleCount = state.females.length;

    if (maleCount >= config.MAX_PLAYERS_PER_GENDER && femaleCount >= config.MAX_PLAYERS_PER_GENDER) {
      await this.startSession(session.id);
    }

    const finalState = await this.getSessionState(session.id);
    return { sessionId: session.id, state: finalState };
  }

  private async findOpenLobby(gender: Gender) {
    const lobbies = await prisma.session.findMany({
      where: { status: 'lobby' },
      include: {
        participants: { include: { user: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const lobby of lobbies) {
      const genderCount = lobby.participants.filter(p => p.user.gender === gender).length;
      if (genderCount < config.MAX_PLAYERS_PER_GENDER) {
        return lobby;
      }
    }
    return null;
  }

  private startLobbyTimer(sessionId: string) {
    const timer = setTimeout(async () => {
      lobbyTimers.delete(sessionId);
      try {
        const state = await this.getSessionState(sessionId);
        if (state.status !== 'lobby') return;

        const maleCount = state.males.length;
        const femaleCount = state.females.length;

        if (maleCount >= config.MIN_PLAYERS_PER_GENDER && femaleCount >= config.MIN_PLAYERS_PER_GENDER) {
          logger.info('Lobby timeout - starting with available players', {
            sessionId,
            males: maleCount,
            females: femaleCount,
          });
          await this.startSession(sessionId);
        } else {
          logger.info('Lobby timeout - not enough players, closing', { sessionId });
          await prisma.session.update({
            where: { id: sessionId },
            data: { status: 'closed' },
          });
          this.onLobbyTimeout?.(sessionId);
        }
      } catch (error) {
        logger.error('Lobby timer error', { sessionId, error });
      }
    }, config.LOBBY_TIMEOUT_SEC * 1000);

    lobbyTimers.set(sessionId, timer);
  }

  async startSession(sessionId: string) {
    const timer = lobbyTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      lobbyTimers.delete(sessionId);
    }

    const questions = await prisma.question.findMany({
      where: { sessionId },
      orderBy: { round: 'asc' },
    });

    // Re-number rounds
    for (let i = 0; i < questions.length; i++) {
      await prisma.question.update({
        where: { id: questions[i].id },
        data: { round: i + 1 },
      });
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'roster',
        totalRounds: questions.length,
        currentRound: 0,
        startedAt: new Date(),
      },
    });

    logger.info('Session started → roster', { sessionId, totalRounds: questions.length });

    const state = await this.getSessionState(sessionId);
    this.onSessionUpdate?.(sessionId, state);
  }

  async advanceToQaRounds(sessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'qa_rounds', currentRound: 1 },
    });

    logger.info('Session → qa_rounds', { sessionId });
    const state = await this.getSessionState(sessionId);
    this.onSessionUpdate?.(sessionId, state);
  }

  async submitAnswer(sessionId: string, userId: string, questionId: string, answerText: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'qa_rounds') {
      throw new Error('Session is not in QA rounds');
    }

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.sessionId !== sessionId) {
      throw new Error('Invalid question');
    }

    if (question.round !== session.currentRound) {
      throw new Error('Not the current round');
    }

    // Check user is opposite gender from question author
    const [user, author] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.user.findUnique({ where: { id: question.authorId } }),
    ]);
    if (!user || !author) throw new Error('User not found');
    if (user.gender === author.gender) throw new Error('Cannot answer own gender questions');

    const sanitized = sanitizeText(answerText);
    if (!sanitized || sanitized.length < 1) throw new Error('Answer is too short');
    if (containsToxicContent(sanitized)) throw new Error('Answer contains inappropriate content');

    await prisma.answer.upsert({
      where: { questionId_authorId: { questionId, authorId: userId } },
      update: { text: sanitized },
      create: { questionId, authorId: userId, text: sanitized },
    });

    logger.info('Answer submitted', { sessionId, userId, questionId });

    // Check if all answers received for this round
    const allAnswers = await this.checkAllAnswersReceived(sessionId, question);
    if (allAnswers) {
      await this.moveToVoting(sessionId);
    }
  }

  private async checkAllAnswersReceived(sessionId: string, question: { id: string; authorId: string }): Promise<boolean> {
    const author = await prisma.user.findUnique({ where: { id: question.authorId } });
    if (!author) return false;

    const oppositeGender = author.gender === 'male' ? 'female' : 'male';
    const respondents = await this.getParticipantsByGender(sessionId, oppositeGender);
    const answers = await prisma.answer.findMany({ where: { questionId: question.id } });

    return answers.length >= respondents.length;
  }

  private async moveToVoting(sessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'voting' },
    });

    logger.info('Session → voting', { sessionId });
    const state = await this.getSessionState(sessionId);
    this.onSessionUpdate?.(sessionId, state);
  }

  async submitVote(sessionId: string, voterId: string, questionId: string, votedForId: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'voting') {
      throw new Error('Session is not in voting phase');
    }

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.sessionId !== sessionId || question.round !== session.currentRound) {
      throw new Error('Invalid question for current round');
    }

    // Validate voter and votedFor are opposite genders
    const [voter, votedFor] = await Promise.all([
      prisma.user.findUnique({ where: { id: voterId } }),
      prisma.user.findUnique({ where: { id: votedForId } }),
    ]);
    if (!voter || !votedFor) throw new Error('User not found');
    if (voter.gender === votedFor.gender) throw new Error('Must vote for opposite gender');

    // Find the answer by votedFor for this question
    const answer = await prisma.answer.findUnique({
      where: { questionId_authorId: { questionId, authorId: votedForId } },
    });

    await prisma.vote.upsert({
      where: { questionId_voterId: { questionId, voterId } },
      update: { votedForId, answerId: answer?.id || null },
      create: { questionId, voterId, votedForId, answerId: answer?.id || null },
    });

    logger.info('Vote submitted', { sessionId, voterId, votedForId, questionId });

    // Check if all votes received
    const allVotes = await this.checkAllVotesReceived(sessionId, question);
    if (allVotes) {
      await this.advanceRound(sessionId);
    }
  }

  private async checkAllVotesReceived(sessionId: string, question: { id: string; authorId: string }): Promise<boolean> {
    // Voters are the SAME gender as the question author (they choose best answer from opposite gender)
    const author = await prisma.user.findUnique({ where: { id: question.authorId } });
    if (!author) return false;

    const voters = await this.getParticipantsByGender(sessionId, author.gender!);
    const votes = await prisma.vote.findMany({ where: { questionId: question.id } });

    return votes.length >= voters.length;
  }

  private async advanceRound(sessionId: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    if (session.currentRound >= session.totalRounds) {
      // All rounds done → calculate matches
      await this.calculateMatches(sessionId);
    } else {
      // Next round
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          currentRound: session.currentRound + 1,
          status: 'qa_rounds',
        },
      });

      logger.info('Session → next round', {
        sessionId,
        round: session.currentRound + 1,
      });

      const state = await this.getSessionState(sessionId);
      this.onSessionUpdate?.(sessionId, state);
    }
  }

  async forceAdvanceRound(sessionId: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    if (session.status === 'qa_rounds') {
      await this.moveToVoting(sessionId);
    } else if (session.status === 'voting') {
      await this.advanceRound(sessionId);
    }
  }

  async calculateMatches(sessionId: string) {
    const participants = await this.getSessionParticipants(sessionId);
    const males = participants.filter(p => p.gender === 'male');
    const females = participants.filter(p => p.gender === 'female');

    // Get all votes in this session
    const questions = await prisma.question.findMany({ where: { sessionId } });
    const questionIds = questions.map(q => q.id);
    const allVotes = await prisma.vote.findMany({
      where: { questionId: { in: questionIds } },
    });

    // For each male, count how many times they voted for each female
    const malePreferences = new Map<string, Map<string, number>>();
    // For each female, count how many times they voted for each male
    const femalePreferences = new Map<string, Map<string, number>>();

    for (const vote of allVotes) {
      const voter = participants.find(p => p.userId === vote.voterId);
      if (!voter) continue;

      const prefMap = voter.gender === 'male' ? malePreferences : femalePreferences;
      if (!prefMap.has(vote.voterId)) {
        prefMap.set(vote.voterId, new Map());
      }
      const counts = prefMap.get(vote.voterId)!;
      counts.set(vote.votedForId, (counts.get(vote.votedForId) || 0) + 1);
    }

    // Find mutual matches
    const matches: { userAId: string; userBId: string; score: number }[] = [];

    for (const male of males) {
      const malePref = malePreferences.get(male.userId);
      if (!malePref) continue;

      // Find male's top choice
      let maleTopChoice: string | null = null;
      let maleTopScore = 0;
      for (const [femaleId, count] of malePref) {
        if (count > maleTopScore) {
          maleTopScore = count;
          maleTopChoice = femaleId;
        }
      }

      if (!maleTopChoice) continue;

      // Check if that female also chose this male as top
      const femalePref = femalePreferences.get(maleTopChoice);
      if (!femalePref) continue;

      let femaleTopChoice: string | null = null;
      let femaleTopScore = 0;
      for (const [maleId, count] of femalePref) {
        if (count > femaleTopScore) {
          femaleTopScore = count;
          femaleTopChoice = maleId;
        }
      }

      if (femaleTopChoice === male.userId) {
        matches.push({
          userAId: male.userId,
          userBId: maleTopChoice,
          score: maleTopScore + femaleTopScore,
        });
      }
    }

    // Save matches
    for (const match of matches) {
      await prisma.match.create({
        data: {
          sessionId,
          userAId: match.userAId,
          userBId: match.userBId,
          score: match.score,
        },
      });
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'results', endedAt: new Date() },
    });

    logger.info('Session → results', { sessionId, matchCount: matches.length });

    const state = await this.getSessionState(sessionId);
    this.onSessionUpdate?.(sessionId, state);
  }

  async getSessionState(sessionId: string): Promise<SessionState> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found');

    const participants = await this.getSessionParticipants(sessionId);
    const males = participants.filter(p => p.gender === 'male');
    const females = participants.filter(p => p.gender === 'female');

    const state: SessionState = {
      id: session.id,
      status: session.status,
      currentRound: session.currentRound,
      totalRounds: session.totalRounds,
      males,
      females,
    };

    if ((session.status === 'qa_rounds' || session.status === 'voting') && session.currentRound > 0) {
      const question = await prisma.question.findFirst({
        where: { sessionId, round: session.currentRound },
      });
      if (question) {
        state.currentQuestion = {
          id: question.id,
          text: question.text,
          authorId: question.authorId,
          round: question.round,
        };

        if (session.status === 'voting') {
          const answers = await prisma.answer.findMany({
            where: { questionId: question.id },
            select: { id: true, authorId: true, text: true },
          });
          state.answers = answers;
        }
      }
    }

    return state;
  }

  async getMatchResults(sessionId: string) {
    const matches = await prisma.match.findMany({
      where: { sessionId },
      include: {
        userA: true,
        userB: true,
      },
    });

    return matches.map(m => ({
      id: m.id,
      userA: {
        id: m.userA.id,
        firstName: m.userA.firstName,
        username: m.userA.username,
        photoUrl: m.userA.photoUrl,
        telegramId: Number(m.userA.telegramId),
      },
      userB: {
        id: m.userB.id,
        firstName: m.userB.firstName,
        username: m.userB.username,
        photoUrl: m.userB.photoUrl,
        telegramId: Number(m.userB.telegramId),
      },
      score: m.score,
    }));
  }

  async submitReport(reporterId: string, reportedId: string, reason: string, contentRef?: string) {
    await prisma.report.create({
      data: {
        reporterId,
        reportedId,
        reason: sanitizeText(reason),
        contentRef: contentRef || null,
      },
    });
    logger.info('Report submitted', { reporterId, reportedId, reason });
  }

  private async getSessionParticipants(sessionId: string): Promise<SessionPlayer[]> {
    const participants = await prisma.sessionParticipant.findMany({
      where: { sessionId },
      include: { user: true },
    });

    return participants.map(p => ({
      userId: p.user.id,
      telegramId: Number(p.user.telegramId),
      firstName: p.user.firstName,
      username: p.user.username,
      photoUrl: p.user.photoUrl,
      gender: p.user.gender!,
    }));
  }

  private async getParticipantsByGender(sessionId: string, gender: Gender): Promise<SessionPlayer[]> {
    const all = await this.getSessionParticipants(sessionId);
    return all.filter(p => p.gender === gender);
  }
}

export const gameService = new GameService();
