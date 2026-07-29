import { Router } from 'express';
import {
  getDirectMessages,
  getGroupMessages,
  sendMessage,
  editMessage,
  togglePinMessage,
  deleteMessageForMe,
  deleteMessageForEveryone,
  reactToMessage,
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/direct/:partnerId', authenticateToken, getDirectMessages);
router.get('/group/:groupId', authenticateToken, getGroupMessages);
router.post('/send', authenticateToken, sendMessage);
router.put('/edit/:messageId', authenticateToken, editMessage);
router.put('/pin/:messageId', authenticateToken, togglePinMessage);
router.delete('/delete-for-me/:messageId', authenticateToken, deleteMessageForMe);
router.delete('/delete-everyone/:messageId', authenticateToken, deleteMessageForEveryone);
router.post('/react/:messageId', authenticateToken, reactToMessage);

export default router;
