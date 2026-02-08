import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authMiddleware } from '../middleware/auth';
import { submitLimiter } from '../middleware/rateLimit';
import { z } from 'zod';

const router = Router();

router.use(authMiddleware);

// Get current user profile
router.get('/me', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    telegramId: Number(user.telegramId),
    username: user.username,
    firstName: user.firstName,
    photoUrl: user.photoUrl,
    gender: user.gender,
  });
});

// Set gender (once)
const setGenderSchema = z.object({
  gender: z.enum(['male', 'female']),
});

router.post('/gender', submitLimiter, async (req: Request, res: Response) => {
  const parsed = setGenderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid gender value' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (user.gender) {
    res.status(400).json({ error: 'Gender already set' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { gender: parsed.data.gender },
  });

  res.json({
    id: updated.id,
    gender: updated.gender,
  });
});

export default router;
