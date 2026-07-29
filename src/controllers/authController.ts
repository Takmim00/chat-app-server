import { Request, Response } from 'express';
import User from '../models/User.js';
import { generateOtp } from '../utils/generateOtp.js';
import { sendOtpEmail } from '../config/resend.js';
import { generateToken } from '../utils/jwt.js';
import { generateFriendId } from '../utils/generateFriendId.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

export const requestOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email address is required.' });
    }

    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Create user draft
      let friendId = generateFriendId();
      while (await User.findOne({ friendId })) {
        friendId = generateFriendId();
      }
      user = new User({
        email: email.toLowerCase(),
        name: email.split('@')[0],
        username: email.split('@')[0] + Math.floor(100 + Math.random() * 900),
        friendId,
        otp,
        otpExpires,
      });
    } else {
      user.otp = otp;
      user.otpExpires = otpExpires;
    }

    await user.save();
    await sendOtpEmail(email, otp);

    return res.status(200).json({
      success: true,
      message: 'OTP sent to email successfully.',
      devOtp: process.env.NODE_ENV === 'development' ? otp : undefined,
    });
  } catch (error) {
    console.error('Request OTP Error:', error);
    return res.status(500).json({ message: 'Failed to request OTP.' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp, rememberMe } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.otp || !user.otpExpires) {
      return res.status(400).json({ message: 'Invalid or expired OTP code.' });
    }

    if (new Date() > user.otpExpires) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new code.' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Incorrect OTP code.' });
    }

    // Reset OTP fields
    user.otp = undefined;
    user.otpExpires = undefined;
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    const token = generateToken(user._id.toString(), rememberMe);

    return res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        username: user.username,
        profilePic: user.profilePic,
        bio: user.bio,
        friendId: user.friendId,
        isOnline: user.isOnline,
      },
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({ message: 'Failed to verify OTP.' });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId)
      .select('-otp -otpExpires')
      .populate('friends', 'name username profilePic friendId isOnline lastSeen bio');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching current user profile.' });
  }
};
