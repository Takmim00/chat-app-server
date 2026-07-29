import { Router } from 'express';
import {
  searchByFriendId,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendRequests,
  getFriendsList,
} from '../controllers/friendController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/search', authenticateToken, searchByFriendId);
router.post('/request', authenticateToken, sendFriendRequest);
router.post('/accept', authenticateToken, acceptFriendRequest);
router.post('/reject', authenticateToken, rejectFriendRequest);
router.get('/requests', authenticateToken, getFriendRequests);
router.get('/list', authenticateToken, getFriendsList);

export default router;
