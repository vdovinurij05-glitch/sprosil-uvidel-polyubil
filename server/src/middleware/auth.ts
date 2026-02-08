import { Request, Response, NextFunction } from 'express';
import { validateInitData } from '../utils/telegram';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      telegramId?: number;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const initData = req.headers['x-telegram-init-data'] as string;

  if (!initData) {
    res.status(401).json({ error: 'Missing Telegram init data' });
    return;
  }

  const parsed = validateInitData(initData);
  if (!parsed) {
    res.status(401).json({ error: 'Invalid Telegram init data' });
    return;
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

    req.userId = user.id;
    req.telegramId = parsed.user.id;
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}
