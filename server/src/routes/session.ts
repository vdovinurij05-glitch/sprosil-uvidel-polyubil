import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { gameService } from '../services/gameService';

const router = Router();

router.use(authMiddleware);

// Get session state
router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const state = await gameService.getSessionState(req.params.sessionId);
    res.json(state);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Get match results
router.get('/:sessionId/matches', async (req: Request, res: Response) => {
  try {
    const matches = await gameService.getMatchResults(req.params.sessionId);
    res.json(matches);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

export default router;
