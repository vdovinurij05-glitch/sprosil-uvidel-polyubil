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
  // Used for final voting phase: show all Q&A for the whole session.
  questions?: {
    id: string;
    text: string;
    authorId: string;
    round: number;
  }[];
  allAnswers?: {
    questionId: string;
    authorId: string;
    text: string;
  }[];
  finalVotes?: {
    voterId: string;
    votedForId: string | null;
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
    let sessionId: string;
    const existingLobby = await this.findOpenLobby(user.gender as Gender);
    if (existingLobby) {
      sessionId = existingLobby.id;
    } else {
      const created = await prisma.session.create({ data: {} });
      sessionId = created.id;
      logger.info('New lobby created', { sessionId });
      this.startLobbyTimer(sessionId);
    }

    // Join session
    await prisma.sessionParticipant.create({
      data: { sessionId, userId },
    });

    // Save question
    const participants = await this.getSessionParticipants(sessionId);
    const round = participants.filter((p: SessionPlayer) => p.gender === user.gender).length;

    await prisma.question.create({
      data: {
        sessionId,
        authorId: userId,
        text: sanitized,
        round,
      },
    });

    logger.info('Player joined lobby', {
      sessionId,
      userId,
      gender: user.gender,
    });

    // Check if session can start
    const state = await this.getSessionState(sessionId);
    const maleCount = state.males.length;
    const femaleCount = state.females.length;

    const reachedMax = maleCount >= config.MAX_PLAYERS_PER_GENDER && femaleCount >= config.MAX_PLAYERS_PER_GENDER;
    const reachedMin = maleCount >= config.MIN_PLAYERS_PER_GENDER && femaleCount >= config.MIN_PLAYERS_PER_GENDER;

    if (reachedMax || (config.AUTO_START_ON_MIN_PLAYERS && reachedMin)) {
      await this.startSession(sessionId);
    }

    const finalState = await this.getSessionState(sessionId);
    return { sessionId, state: finalState };
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
      // QA phase: answer ALL questions in parallel.
      data: { status: 'qa_rounds', currentRound: 0 },
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

    const allSessionAnswers = await this.checkAllAnswersReceivedForSession(sessionId);
    if (allSessionAnswers) {
      await this.startVotingPhase(sessionId);
      return;
    }

    const state = await this.getSessionState(sessionId);
    this.onSessionUpdate?.(sessionId, state);
  }

  private async checkAllAnswersReceived(sessionId: string, question: { id: string; authorId: string }): Promise<boolean> {
    const author = await prisma.user.findUnique({ where: { id: question.authorId } });
    if (!author) return false;

    const oppositeGender = author.gender === 'male' ? 'female' : 'male';
    const respondents = await this.getParticipantsByGender(sessionId, oppositeGender);
    const answers = await prisma.answer.findMany({ where: { questionId: question.id } });

    return answers.length >= respondents.length;
  }

  private async checkAllAnswersReceivedForSession(sessionId: string): Promise<boolean> {
    const participants = await this.getSessionParticipants(sessionId);
    const maleCount = participants.filter(p => p.gender === 'male').length;
    const femaleCount = participants.filter(p => p.gender === 'female').length;

    const questions = await prisma.question.findMany({
      where: { sessionId },
      select: { id: true, author: { select: { gender: true } } },
    });

    const counts = await prisma.answer.groupBy({
      by: ['questionId'],
      where: { question: { sessionId } },
      _count: { _all: true },
    });
    const byQ = new Map<string, number>();
    for (const c of counts) byQ.set(c.questionId, c._count._all);

    for (const q of questions) {
      const authorGender = q.author.gender;
      const required = authorGender === 'male' ? femaleCount : maleCount;
      const have = byQ.get(q.id) || 0;
      if (have < required) return false;
    }

    return true;
  }

  private async startVotingPhase(sessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      // Final voting is a single phase, not per-question rounds.
      data: { status: 'voting', currentRound: 0 },
    });

    logger.info('Session → voting', { sessionId });
    const state = await this.getSessionState(sessionId);
    this.onSessionUpdate?.(sessionId, state);
  }

  async submitVote(sessionId: string, voterId: string, _questionId: string | null, votedForId: string | null): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'voting') {
      throw new Error('Session is not in voting phase');
    }

    const voter = await prisma.user.findUnique({ where: { id: voterId } });
    if (!voter) throw new Error('User not found');

    if (votedForId) {
      const votedFor = await prisma.user.findUnique({ where: { id: votedForId } });
      if (!votedFor) throw new Error('User not found');
      if (voter.gender === votedFor.gender) throw new Error('Must vote for opposite gender');
    }

    await prisma.finalVote.upsert({
      where: { sessionId_voterId: { sessionId, voterId } },
      update: { votedForId },
      create: { sessionId, voterId, votedForId },
    });

    logger.info('Final vote submitted', { sessionId, voterId, votedForId });

    const allFinalVotes = await this.checkAllFinalVotesReceived(sessionId);
    if (allFinalVotes) {
      await this.calculateMatches(sessionId);
    }
  }

  private async checkAllFinalVotesReceived(sessionId: string): Promise<boolean> {
    const participants = await prisma.sessionParticipant.count({ where: { sessionId } });
    const votes = await prisma.finalVote.count({ where: { sessionId } });
    return votes >= participants;
  }

  async forceAdvanceRound(sessionId: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    if (session.status === 'qa_rounds') {
      // QA timeout: move to voting even if some answers are missing.
      await this.startVotingPhase(sessionId);
    } else if (session.status === 'voting') {
      // Final voting timeout: treat missing voters as "no one" and close results.
      const participants = await prisma.sessionParticipant.findMany({ where: { sessionId } });
      for (const p of participants) {
        await prisma.finalVote.upsert({
          where: { sessionId_voterId: { sessionId, voterId: p.userId } },
          update: {},
          create: { sessionId, voterId: p.userId, votedForId: null },
        });
      }
      await this.calculateMatches(sessionId);
    }
  }

  async calculateMatches(sessionId: string) {
    const participants = await this.getSessionParticipants(sessionId);
    const males = participants.filter(p => p.gender === 'male');
    const females = participants.filter(p => p.gender === 'female');

    // Final voting: mutual choice in one round.
    const finalVotes = await prisma.finalVote.findMany({ where: { sessionId } });
    const byVoter = new Map<string, string | null>();
    for (const v of finalVotes) byVoter.set(v.voterId, v.votedForId);

    const matches: { userAId: string; userBId: string; score: number }[] = [];
    for (const [voterId, votedForId] of byVoter) {
      if (!votedForId) continue;
      const back = byVoter.get(votedForId);
      if (back !== voterId) continue;

      const a = voterId < votedForId ? voterId : votedForId;
      const b = voterId < votedForId ? votedForId : voterId;
      // avoid duplicates
      if (matches.find(m => m.userAId === a && m.userBId === b)) continue;
      matches.push({ userAId: a, userBId: b, score: 1 });
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

    // Provide full question+answer set for QA progress UI and for final voting UI.
    if (session.status === 'qa_rounds' || session.status === 'voting') {
      const questions = await prisma.question.findMany({
        where: { sessionId },
        select: { id: true, text: true, authorId: true, round: true },
        orderBy: { round: 'asc' },
      });
      const answers = await prisma.answer.findMany({
        where: { question: { sessionId } },
        select: { questionId: true, authorId: true, text: true },
      });
      state.questions = questions;
      state.allAnswers = answers;
    }

    if (session.status === 'voting' || session.status === 'results') {
      const finalVotes = await prisma.finalVote.findMany({
        where: { sessionId },
        select: { voterId: true, votedForId: true },
      });
      state.finalVotes = finalVotes;
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
