import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, username, bio, profilePic } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ message: 'Username is already taken.' });
      }
      user.username = username;
    }

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (profilePic !== undefined) user.profilePic = profilePic;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        username: user.username,
        profilePic: user.profilePic,
        bio: user.bio,
        friendId: user.friendId,
      },
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    return res.status(500).json({ message: 'Failed to update profile.' });
  }
};

export const blockUser = async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ message: 'Target user ID is required.' });
    }

    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!currentUser.blockedUsers.includes(targetUserId)) {
      currentUser.blockedUsers.push(targetUserId);
      await currentUser.save();
    }

    return res.status(200).json({ success: true, message: 'User blocked successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to block user.' });
  }
};

export const unblockUser = async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId } = req.body;
    const currentUser = await User.findById(req.userId);

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    currentUser.blockedUsers = currentUser.blockedUsers.filter(
      (id) => id.toString() !== targetUserId
    );
    await currentUser.save();

    return res.status(200).json({ success: true, message: 'User unblocked successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to unblock user.' });
  }
};
