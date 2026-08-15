import { Router } from 'express';
import { requestOtp, verifyOtp, getCurrentUser, refreshToken } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/request-otp', authLimiter, requestOtp);
router.post('/verify-otp', authLimiter, verifyOtp);
router.post('/refresh', refreshToken);
router.get('/me', authenticateToken, getCurrentUser);

export default router;
