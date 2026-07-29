import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import CallLog from '../models/CallLog.js';

export const logCall = async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId, groupId, isGroupCall, startTime, endTime, duration, status } = req.body;
    const callerId = req.userId;

    const callLog = await CallLog.create({
      callerId,
      receiverId,
      groupId,
      isGroupCall: isGroupCall || false,
      startTime: startTime || new Date(),
      endTime,
      duration: duration || 0,
      status: status || 'completed',
    });

    return res.status(201).json({ success: true, callLog });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to record call log.' });
  }
};

export const getCallHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const logs = await CallLog.find({
      $or: [{ callerId: userId }, { receiverId: userId }],
    })
      .populate('callerId', 'name username profilePic')
      .populate('receiverId', 'name username profilePic')
      .populate('groupId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({ success: true, logs });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch call history.' });
  }
};
