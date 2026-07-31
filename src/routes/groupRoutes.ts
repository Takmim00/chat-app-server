import { Router } from 'express';
import {
  createGroup,
  getUserGroups,
  updateGroupSettings,
  addMember,
  removeMember,
  joinGroupByInviteCode,
  deleteGroup,
} from '../controllers/groupController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/create', authenticateToken, createGroup);
router.get('/list', authenticateToken, getUserGroups);
router.put('/settings/:groupId', authenticateToken, updateGroupSettings);
router.post('/member/add/:groupId', authenticateToken, addMember);
router.post('/member/remove/:groupId', authenticateToken, removeMember);
router.post('/join/:inviteCode', authenticateToken, joinGroupByInviteCode);
router.delete('/:groupId', authenticateToken, deleteGroup);

export default router;
