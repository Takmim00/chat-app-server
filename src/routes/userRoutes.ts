import { Router } from 'express';
import { updateProfile, blockUser, unblockUser } from '../controllers/userController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

router.put('/profile', authenticateToken, updateProfile);
router.post('/block', authenticateToken, blockUser);
router.post('/unblock', authenticateToken, unblockUser);

export default router;
