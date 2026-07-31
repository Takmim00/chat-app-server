import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import Group from '../models/Group.js';
import crypto from 'crypto';

const generateInviteCode = () => crypto.randomBytes(4).toString('hex');

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { name, avatar, description, members, privacy } = req.body;
    const ownerId = req.userId as any;

    if (!name) {
      return res.status(400).json({ message: 'Group name is required.' });
    }

    const groupId = 'GRP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const inviteLinkCode = generateInviteCode();

    const memberList = Array.isArray(members) ? members : [];
    if (!memberList.includes(ownerId)) {
      memberList.push(ownerId);
    }

    const group = await Group.create({
      groupId,
      name,
      avatar: avatar || '',
      description: description || '',
      ownerId,
      admins: [ownerId],
      members: memberList,
      privacy: privacy || 'private',
      inviteLinkCode,
    });

    const populatedGroup = await Group.findById(group._id)
      .populate('ownerId', 'name username profilePic')
      .populate('admins', 'name username profilePic')
      .populate('members', 'name username profilePic friendId isOnline');

    return res.status(201).json({ success: true, group: populatedGroup });
  } catch (error) {
    console.error('Create Group Error:', error);
    return res.status(500).json({ message: 'Failed to create group.' });
  }
};

export const getUserGroups = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const groups = await Group.find({ members: userId })
      .populate('ownerId', 'name username profilePic')
      .populate('admins', 'name username profilePic')
      .populate('members', 'name username profilePic friendId isOnline lastSeen')
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, groups });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch user groups.' });
  }
};

export const updateGroupSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { name, avatar, description, privacy } = req.body;
    const userId = req.userId;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    // Only Admin or Owner can edit
    const isAdminOrOwner =
      group.ownerId.toString() === userId || group.admins.some((id) => id.toString() === userId);

    if (!isAdminOrOwner) {
      return res.status(403).json({ message: 'Permission denied. Admins only.' });
    }

    if (name) group.name = name;
    if (avatar !== undefined) group.avatar = avatar;
    if (description !== undefined) group.description = description;
    if (privacy) group.privacy = privacy;

    await group.save();

    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update group settings.' });
  }
};

export const addMember = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const userId = req.userId;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const isAdminOrOwner =
      group.ownerId.toString() === userId || group.admins.some((id) => id.toString() === userId);
    if (!isAdminOrOwner) return res.status(403).json({ message: 'Admin permission required.' });

    if (group.members.some((m) => m.toString() === memberId)) {
      return res.status(400).json({ message: 'User is already a member.' });
    }

    group.members.push(memberId);
    await group.save();

    return res.status(200).json({ success: true, message: 'Member added successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add member.' });
  }
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const userId = req.userId;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const isAdminOrOwner =
      group.ownerId.toString() === userId || group.admins.some((id) => id.toString() === userId);
    if (!isAdminOrOwner && memberId !== userId) {
      return res.status(403).json({ message: 'Permission denied.' });
    }

    group.members = group.members.filter((m) => m.toString() !== memberId);
    group.admins = group.admins.filter((a) => a.toString() !== memberId);
    await group.save();

    return res.status(200).json({ success: true, message: 'Member removed.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to remove member.' });
  }
};

export const joinGroupByInviteCode = async (req: AuthRequest, res: Response) => {
  try {
    const { inviteCode } = req.params;
    const userId = req.userId as any;

    const group = await Group.findOne({ inviteLinkCode: inviteCode });
    if (!group) return res.status(404).json({ message: 'Invalid invite link.' });

    if (group.bannedMembers.some((b) => b.toString() === userId)) {
      return res.status(403).json({ message: 'You have been banned from this group.' });
    }

    if (!group.members.includes(userId)) {
      group.members.push(userId);
      await group.save();
    }
    return res.status(200).json({ success: true, message: 'Joined group successfully.', group });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to join group.' });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    if (group.ownerId.toString() !== userId) {
      return res.status(403).json({ message: 'Only group owner can delete the group.' });
    }

    await Group.findByIdAndDelete(groupId);
    return res.status(200).json({ success: true, message: 'Group deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete group.' });
  }
};
