import { Server, Socket } from 'socket.io';
import { validateInitData } from '../utils/telegram';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';
import { gameService, SessionState } from '../services/gameService';
import { config } from '../config';

// Track user sockets: userId → socketId
const userSockets = new Map<string, string>();
// Track session rooms
const sessionUsers = new Map<string, Set<string>>();

// Round timers (timeout + interval) to avoid multiple overlapping tickers.
const roundTimers = new Map<string, { timeout: NodeJS.Timeout; interval: NodeJS.Timeout }>();

export function setupSocketHandlers(io: Server) {
  // Set up game service callbacks
  gameService.setCallbacks({
    onSessionUpdate: (sessionId: string, state: SessionState) => {
      io.to(`session:${sessionId}`).emit('session:update', state);

      // Set up timeouts for qa_rounds and voting
      if (state.status === 'qa_rounds') {
        setRoundTimer(io, sessionId, config.ANSWER_TIMEOUT_SEC, 'answer');
      } else if (state.status === 'voting') {
        setRoundTimer(io, sessionId, config.VOTE_TIMEOUT_SEC, 'vote');
      }
    },
    onLobbyTimeout: (sessionId: string) => {
      io.to(`session:${sessionId}`).emit('session:closed', {
        reason: 'Not enough players joined in time',
      });
    },
  });

  io.use(async (socket, next) => {
    const initData = socket.handshake.auth.initData as string;
    if (!initData) {
      return next(new Error('Missing Telegram init data'));
    }

    const parsed = validateInitData(initData);
    if (!parsed) {
      return next(new Error('Invalid Telegram init data'));
    }

    try {
      const user = await prisma.user.upsert({
        where: { telegramId: BigInt(parsed.user.id) },
        update: {
          username: parsed.user.username || null,
          firstName: parsed.user.first_name,
          photoUrl: parsed.user.photo_url || null,
        },
        create: {
          telegramId: BigInt(parsed.user.id),
          username: parsed.user.username || null,
          firstName: parsed.user.first_name,
          photoUrl: parsed.user.photo_url || null,
        },
      });

      (socket as any).userId = user.id;
      (socket as any).telegramId = parsed.user.id;
      next();
    } catch (error) {
      next(new Error('Auth failed'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as string;
    userSockets.set(userId, socket.id);

    logger.info('Socket connected', { userId, socketId: socket.id });

    // Join lobby with a question
    socket.on('lobby:join', async (data: { question: string }, callback) => {
      try {
        const result = await gameService.joinLobby(userId, data.question);
        socket.join(`session:${result.sessionId}`);

        // Track user in session
        if (!sessionUsers.has(result.sessionId)) {
          sessionUsers.set(result.sessionId, new Set());
        }
        sessionUsers.get(result.sessionId)!.add(userId);

        callback({ ok: true, sessionId: result.sessionId, state: result.state });

        // Notify other lobby members
        socket.to(`session:${result.sessionId}`).emit('session:update', result.state);
      } catch (error: any) {
        logger.error('lobby:join error', { userId, error: error.message });
        callback({ ok: false, error: error.message });
      }
    });

    // Roster acknowledged → advance to QA rounds
    socket.on('roster:ready', async (data: { sessionId: string }, callback) => {
      try {
        // Simple: after roster is shown for a few seconds, advance
        await gameService.advanceToQaRounds(data.sessionId);
        callback({ ok: true });
      } catch (error: any) {
        callback({ ok: false, error: error.message });
      }
    });

    // Submit answer
    socket.on('answer:submit', async (data: { sessionId: string; questionId: string; answer: string }, callback) => {
      try {
        await gameService.submitAnswer(data.sessionId, userId, data.questionId, data.answer);
        callback({ ok: true });

        const state = await gameService.getSessionState(data.sessionId);
        io.to(`session:${data.sessionId}`).emit('session:update', state);
      } catch (error: any) {
        logger.error('answer:submit error', { userId, error: error.message });
        callback({ ok: false, error: error.message });
      }
    });

    // Submit vote
    socket.on('vote:submit', async (data: { sessionId: string; questionId: string; votedForId: string }, callback) => {
      try {
        await gameService.submitVote(data.sessionId, userId, data.questionId, data.votedForId);
        callback({ ok: true });

        const state = await gameService.getSessionState(data.sessionId);
        io.to(`session:${data.sessionId}`).emit('session:update', state);
      } catch (error: any) {
        logger.error('vote:submit error', { userId, error: error.message });
        callback({ ok: false, error: error.message });
      }
    });

    // Get match results
    socket.on('matches:get', async (data: { sessionId: string }, callback) => {
      try {
        const matches = await gameService.getMatchResults(data.sessionId);
        callback({ ok: true, matches });
      } catch (error: any) {
        callback({ ok: false, error: error.message });
      }
    });

    // Report
    socket.on('report:submit', async (data: { reportedId: string; reason: string; contentRef?: string }, callback) => {
      try {
        await gameService.submitReport(userId, data.reportedId, data.reason, data.contentRef);
        callback({ ok: true });
      } catch (error: any) {
        callback({ ok: false, error: error.message });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      userSockets.delete(userId);
      logger.info('Socket disconnected', { userId });
    });
  });
}

function setRoundTimer(io: Server, sessionId: string, seconds: number, phase: 'answer' | 'vote') {
  const key = `${sessionId}:${phase}`;

  // Clear existing timer + interval
  const existing = roundTimers.get(key);
  if (existing) {
    clearTimeout(existing.timeout);
    clearInterval(existing.interval);
    roundTimers.delete(key);
  }

  // Emit initial value immediately so UI doesn't show stale seconds from previous phase.
  io.to(`session:${sessionId}`).emit('timer:tick', { phase, remaining: seconds });

  // Emit countdown
  const startTime = Date.now();
  const interval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = seconds - elapsed;
    if (remaining <= 0) {
      clearInterval(interval);
      return;
    }
    io.to(`session:${sessionId}`).emit('timer:tick', { phase, remaining });
  }, 1000);

  const timer = setTimeout(async () => {
    clearInterval(interval);
    roundTimers.delete(key);
    try {
      await gameService.forceAdvanceRound(sessionId);
    } catch (error) {
      logger.error('Round timer force advance error', { sessionId, error });
    }
  }, seconds * 1000);

  roundTimers.set(key, { timeout: timer, interval });
}
