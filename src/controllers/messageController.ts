import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Group from '../models/Group.js';

export const getDirectMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.params;
    const userId = req.userId;

    const messages = await Message.find({
      $or: [
        { senderId: userId, chatId: partnerId },
        { senderId: partnerId, chatId: userId },
      ],
      deletedFor: { $ne: userId },
    })
      .populate('senderId', 'name username profilePic')
      .populate('replyToId', 'content senderId fileUrl type')
      .sort({ createdAt: 1 });

    return res.status(200).json({ success: true, messages });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch messages.' });
  }
};

export const getGroupMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    // Verify membership
    const group = await Group.findOne({ _id: groupId, members: userId });
    if (!group) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this group.' });
    }

    const messages = await Message.find({
      groupId,
      deletedFor: { $ne: userId },
    })
      .populate('senderId', 'name username profilePic')
      .populate('replyToId', 'content senderId fileUrl type')
      .populate('mentions', 'name username')
      .sort({ createdAt: 1 });

    return res.status(200).json({ success: true, messages });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch group messages.' });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, groupId, content, type, fileUrl, fileName, fileSize, fileType, replyToId, mentions } = req.body;
    const senderId = req.userId;

    if (!chatId && !groupId) {
      return res.status(400).json({ message: 'Recipient chatId or groupId is required.' });
    }

    const message = await Message.create({
      chatId: chatId || undefined,
      groupId: groupId || undefined,
      senderId,
      content: content || '',
      type: type || 'text',
      fileUrl,
      fileName,
      fileSize,
      fileType,
      replyToId: replyToId || undefined,
      mentions: mentions || [],
      seenBy: [{ userId: senderId, timestamp: new Date() }],
      deliveredTo: [{ userId: senderId, timestamp: new Date() }],
    });

    const populatedMsg = await Message.findById(message._id)
      .populate('senderId', 'name username profilePic')
      .populate('replyToId', 'content senderId fileUrl type');

    // DUAL-PATH SOCKET BROADCAST: Emit directly from server to target socket room
    const io = req.app.get('io');
    if (io) {
      if (chatId) {
        const targetRoom = chatId.toString();
        console.log(`[Server API Broadcast] Sending message:receive to room ${targetRoom}`);
        io.to(targetRoom).emit('message:receive', populatedMsg);
      } else if (groupId) {
        console.log(`[Server API Broadcast] Sending group:message-receive to group:${groupId}`);
        io.to(`group:${groupId}`).emit('group:message-receive', { groupId, message: populatedMsg });
      }
    }

    return res.status(201).json({ success: true, message: populatedMsg });
  } catch (error) {
    console.error('Send Message Error:', error);
    return res.status(500).json({ message: 'Failed to send message.' });
  }
};

export const editMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.userId;

    const message = await Message.findById(messageId);
    if (!message || message.senderId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized or message not found.' });
    }

    message.content = content;
    message.isEdited = true;
    await message.save();

    return res.status(200).json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to edit message.' });
  }
};

export const togglePinMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    message.isPinned = !message.isPinned;
    await message.save();

    return res.status(200).json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update pin state.' });
  }
};

export const deleteMessageForMe = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { deletedFor: userId },
    });

    return res.status(200).json({ success: true, message: 'Message deleted for you.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete message.' });
  }
};

export const deleteMessageForEveryone = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await Message.findById(messageId);
    if (!message || message.senderId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized or message not found.' });
    }

    message.isDeletedForEveryone = true;
    message.content = 'This message was deleted';
    message.fileUrl = undefined;
    await message.save();

    return res.status(200).json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete message for everyone.' });
  }
};

export const reactToMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.userId as any;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    // Remove existing reaction by user if present
    message.reactions = message.reactions.filter((r) => r.userId.toString() !== userId);
    if (emoji) {
      message.reactions.push({ userId, emoji });
    }

    await message.save();
    return res.status(200).json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to react to message.' });
  }
};
