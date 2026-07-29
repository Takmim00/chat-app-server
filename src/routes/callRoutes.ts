import { Router } from 'express';
import { logCall, getCallHistory } from '../controllers/callController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { callLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/log', authenticateToken, callLimiter, logCall);
router.get('/history', authenticateToken, getCallHistory);

export default router;
