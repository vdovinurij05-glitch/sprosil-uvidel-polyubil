import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { gameService } from '../services/gameService';
import { logger } from '../utils/logger';
import { config } from '../config';

const router = Router();

const BOT_QUESTIONS = {
  male: [
    'Какое самое безумное приключение ты пережила?',
    'Если бы ты могла телепортироваться куда угодно прямо сейчас, куда бы отправилась?',
    'Какой суперсилой ты бы хотела обладать?',
  ],
  female: [
    'Какой самый необычный комплимент ты когда-либо получал?',
    'Если бы ты мог жить в любом фильме, какой бы выбрал?',
    'Что ты делаешь, когда не можешь заснуть?',
  ],
};

const BOT_ANSWERS = [
  'Это отличный вопрос! Я бы выбрал что-то неожиданное и яркое.',
  'Мне кажется, самое важное — это быть собой и наслаждаться моментом.',
  'Однажды я решился на спонтанное путешествие, и это был лучший день!',
  'Я верю, что каждый день приносит что-то удивительное.',
  'Для меня главное — это искренность и чувство юмора.',
];

// Заполнить лобби ботами для тестирования
router.post('/fill-lobby', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { participants: { include: { user: true } } },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status !== 'lobby') {
      res.status(400).json({ error: 'Session is not in lobby' });
      return;
    }

    const existingMales = session.participants.filter(p => p.user.gender === 'male').length;
    const existingFemales = session.participants.filter(p => p.user.gender === 'female').length;
    const neededMales = config.MAX_PLAYERS_PER_GENDER - existingMales;
    const neededFemales = config.MAX_PLAYERS_PER_GENDER - existingFemales;

    const botNames = {
      male: ['Алексей', 'Дмитрий', 'Иван', 'Сергей', 'Антон'],
      female: ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья'],
    };

    const created: string[] = [];

    // Add male bots
    for (let i = 0; i < neededMales; i++) {
      const telegramId = BigInt(900000 + Math.floor(Math.random() * 100000));
      const name = botNames.male[i % botNames.male.length];

      const user = await prisma.user.create({
        data: {
          telegramId,
          firstName: `${name} (бот)`,
          username: `bot_${name.toLowerCase()}_${telegramId}`,
          gender: 'male',
        },
      });

      await prisma.sessionParticipant.create({
        data: { sessionId, userId: user.id },
      });

      const questionIdx = i % BOT_QUESTIONS.male.length;
      await prisma.question.create({
        data: {
          sessionId,
          authorId: user.id,
          text: BOT_QUESTIONS.male[questionIdx],
          round: existingMales + i + 1,
        },
      });

      created.push(`${name} (male)`);
    }

    // Add female bots
    for (let i = 0; i < neededFemales; i++) {
      const telegramId = BigInt(800000 + Math.floor(Math.random() * 100000));
      const name = botNames.female[i % botNames.female.length];

      const user = await prisma.user.create({
        data: {
          telegramId,
          firstName: `${name} (бот)`,
          username: `bot_${name.toLowerCase()}_${telegramId}`,
          gender: 'female',
        },
      });

      await prisma.sessionParticipant.create({
        data: { sessionId, userId: user.id },
      });

      const questionIdx = i % BOT_QUESTIONS.female.length;
      await prisma.question.create({
        data: {
          sessionId,
          authorId: user.id,
          text: BOT_QUESTIONS.female[questionIdx],
          round: existingFemales + i + 1,
        },
      });

      created.push(`${name} (female)`);
    }

    // Start session
    await gameService.startSession(sessionId);

    logger.info('Dev: lobby filled with bots', { sessionId, created });

    res.json({
      ok: true,
      created,
      message: `Added ${neededMales} male and ${neededFemales} female bots. Session started!`,
    });
  } catch (error: any) {
    logger.error('Dev fill-lobby error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Боты автоматически отвечают на текущий вопрос
router.post('/bot-answers', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'qa_rounds') {
      res.status(400).json({ error: 'Session not in qa_rounds' });
      return;
    }

    const question = await prisma.question.findFirst({
      where: { sessionId, round: session.currentRound },
    });
    if (!question) {
      res.status(400).json({ error: 'No question for current round' });
      return;
    }

    const author = await prisma.user.findUnique({ where: { id: question.authorId } });
    if (!author) {
      res.status(400).json({ error: 'Author not found' });
      return;
    }

    const oppositeGender = author.gender === 'male' ? 'female' : 'male';
    const participants = await prisma.sessionParticipant.findMany({
      where: { sessionId },
      include: { user: true },
    });

    const respondents = participants.filter(
      p => p.user.gender === oppositeGender && p.user.firstName.includes('(бот)'),
    );

    let answered = 0;
    for (const r of respondents) {
      const exists = await prisma.answer.findUnique({
        where: { questionId_authorId: { questionId: question.id, authorId: r.userId } },
      });
      if (!exists) {
        const answerText = BOT_ANSWERS[Math.floor(Math.random() * BOT_ANSWERS.length)];
        await gameService.submitAnswer(sessionId, r.userId, question.id, answerText);
        answered++;
      }
    }

    res.json({ ok: true, answered, round: session.currentRound });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Боты автоматически голосуют
router.post('/bot-votes', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'voting') {
      res.status(400).json({ error: 'Session not in voting' });
      return;
    }

    const question = await prisma.question.findFirst({
      where: { sessionId, round: session.currentRound },
    });
    if (!question) {
      res.status(400).json({ error: 'No question' });
      return;
    }

    const author = await prisma.user.findUnique({ where: { id: question.authorId } });
    if (!author) {
      res.status(400).json({ error: 'Author not found' });
      return;
    }

    // Voters are same gender as author
    const participants = await prisma.sessionParticipant.findMany({
      where: { sessionId },
      include: { user: true },
    });

    const botVoters = participants.filter(
      p => p.user.gender === author.gender && p.user.firstName.includes('(бот)'),
    );

    // Candidates to vote for (opposite gender)
    const oppositeGender = author.gender === 'male' ? 'female' : 'male';
    const candidates = participants.filter(p => p.user.gender === oppositeGender);

    let voted = 0;
    for (const voter of botVoters) {
      const exists = await prisma.vote.findUnique({
        where: { questionId_voterId: { questionId: question.id, voterId: voter.userId } },
      });
      if (!exists && candidates.length > 0) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        await gameService.submitVote(sessionId, voter.userId, question.id, target.userId);
        voted++;
      }
    }

    res.json({ ok: true, voted, round: session.currentRound });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
