import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';

export const searchByFriendId = async (req: AuthRequest, res: Response) => {
  try {
    const { friendId } = req.query;
    if (!friendId || typeof friendId !== 'string') {
      return res.status(400).json({ message: 'Friend ID query parameter is required.' });
    }

    const formattedId = friendId.trim().toUpperCase();
    const user = await User.findOne({ friendId: formattedId }).select(
      '_id name username profilePic bio friendId isOnline'
    );

    if (!user) {
      return res.status(404).json({ message: 'No user found with this Friend ID.' });
    }

    if (user._id.toString() === req.userId) {
      return res.status(400).json({ message: 'You cannot search or add yourself.' });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    return res.status(500).json({ message: 'Error searching for user.' });
  }
};

export const sendFriendRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.userId;

    if (!receiverId) {
      return res.status(400).json({ message: 'Receiver ID is required.' });
    }

    if (senderId === receiverId) {
      return res.status(400).json({ message: 'You cannot send a friend request to yourself.' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check if already friends
    const sender = await User.findById(senderId);
    if (sender?.friends.includes(receiverId as any)) {
      return res.status(400).json({ message: 'You are already friends with this user.' });
    }

    // Check existing request
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    });

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ message: 'Friend request is already pending.' });
      }
      // Re-open request if previously rejected
      existingRequest.senderId = senderId as any;
      existingRequest.receiverId = receiverId as any;
      existingRequest.status = 'pending';
      await existingRequest.save();

      // Emit real-time notification
      const io = req.app.get('io');
      if (io) {
        io.to(receiverId.toString()).emit('friend:request-received', { senderId });
      }

      return res.status(200).json({ success: true, message: 'Friend request sent.', request: existingRequest });
    }

    const friendRequest = await FriendRequest.create({
      senderId,
      receiverId,
      status: 'pending',
    });

    // Emit real-time notification to receiver
    const io = req.app.get('io');
    if (io) {
      io.to(receiverId.toString()).emit('friend:request-received', { senderId });
    }

    return res.status(201).json({
      success: true,
      message: 'Friend request sent successfully.',
      request: friendRequest,
    });
  } catch (error) {
    console.error('Send Friend Request Error:', error);
    return res.status(500).json({ message: 'Failed to send friend request.' });
  }
};

export const acceptFriendRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.body;
    const userId = req.userId;

    const request = await FriendRequest.findById(requestId);
    if (!request || request.receiverId.toString() !== userId) {
      return res.status(404).json({ message: 'Friend request not found.' });
    }

    request.status = 'accepted';
    await request.save();

    // Add each other to friends array
    await User.findByIdAndUpdate(request.senderId, { $addToSet: { friends: request.receiverId } });
    await User.findByIdAndUpdate(request.receiverId, { $addToSet: { friends: request.senderId } });

    // REAL-TIME BROADCAST: Notify both users that friend request is accepted
    const io = req.app.get('io');
    if (io) {
      console.log(`[Friend Socket] Emitting friend:accepted to ${request.senderId} and ${request.receiverId}`);
      io.to(request.senderId.toString()).emit('friend:accepted', { friendId: request.receiverId });
      io.to(request.receiverId.toString()).emit('friend:accepted', { friendId: request.senderId });
    }

    return res.status(200).json({ success: true, message: 'Friend request accepted.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to accept friend request.' });
  }
};

export const rejectFriendRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.body;
    const userId = req.userId;

    const request = await FriendRequest.findById(requestId);
    if (!request || request.receiverId.toString() !== userId) {
      return res.status(404).json({ message: 'Friend request not found.' });
    }

    request.status = 'rejected';
    await request.save();

    return res.status(200).json({ success: true, message: 'Friend request rejected.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to reject friend request.' });
  }
};

export const getFriendRequests = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const requests = await FriendRequest.find({ receiverId: userId, status: 'pending' }).populate(
      'senderId',
      'name username profilePic friendId bio'
    );

    return res.status(200).json({ success: true, requests });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch friend requests.' });
  }
};

export const getFriendsList = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).populate(
      'friends',
      '_id name username profilePic bio friendId isOnline lastSeen'
    );

    return res.status(200).json({ success: true, friends: user?.friends || [] });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch friends list.' });
  }
};
