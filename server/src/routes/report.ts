import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { submitLimiter } from '../middleware/rateLimit';
import { gameService } from '../services/gameService';
import { z } from 'zod';

const router = Router();

router.use(authMiddleware);

const reportSchema = z.object({
  reportedId: z.string().min(1),
  reason: z.string().min(3).max(500),
  contentRef: z.string().optional(),
});

router.post('/', submitLimiter, async (req: Request, res: Response) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid report data' });
    return;
  }

  try {
    await gameService.submitReport(
      req.userId!,
      parsed.data.reportedId,
      parsed.data.reason,
      parsed.data.contentRef,
    );
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
