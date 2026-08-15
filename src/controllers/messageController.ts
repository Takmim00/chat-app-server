import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Group from '../models/Group.js';

export const getDirectMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.params;
    const userId = req.userId;
    const { before, limit: limitStr } = req.query;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);

    let query: any = {
      $or: [
        { senderId: userId, chatId: partnerId },
        { senderId: partnerId, chatId: userId },
      ],
      deletedFor: { $ne: userId },
    };

    if (before && typeof before === 'string') {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('senderId', 'name username profilePic')
      .populate('replyToId', 'content senderId fileUrl type')
      .populate('forwardedFrom', 'name username profilePic')
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit) : messages;

    return res.status(200).json({ 
      success: true, 
      messages: result.reverse(), 
      hasMore 
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch messages.' });
  }
};

export const getGroupMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;
    const { before, limit: limitStr } = req.query;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);

    // Verify membership
    const group = await Group.findOne({ _id: groupId, members: userId });
    if (!group) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this group.' });
    }

    let query: any = {
      groupId,
      deletedFor: { $ne: userId },
    };

    if (before && typeof before === 'string') {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('senderId', 'name username profilePic')
      .populate('replyToId', 'content senderId fileUrl type')
      .populate('mentions', 'name username')
      .populate('forwardedFrom', 'name username profilePic')
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit) : messages;

    return res.status(200).json({ 
      success: true, 
      messages: result.reverse(), 
      hasMore 
    });
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
        
        // Also notify all member personal rooms for unread badges
        const group = await Group.findById(groupId);
        if (group) {
          group.members.forEach((memberId) => {
            io.to(memberId.toString()).emit('group:message-receive', { groupId, message: populatedMsg });
          });
        }
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

export const forwardMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId, targetChatId, targetGroupId } = req.body;
    const userId = req.userId;

    if (!messageId) {
      return res.status(400).json({ message: 'Message ID is required.' });
    }
    if (!targetChatId && !targetGroupId) {
      return res.status(400).json({ message: 'Target chat or group ID is required.' });
    }

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({ message: 'Original message not found.' });
    }

    const forwardedMsg = await Message.create({
      chatId: targetChatId || undefined,
      groupId: targetGroupId || undefined,
      senderId: userId,
      content: originalMessage.content,
      type: originalMessage.type,
      fileUrl: originalMessage.fileUrl,
      fileName: originalMessage.fileName,
      fileSize: originalMessage.fileSize,
      fileType: originalMessage.fileType,
      isForwarded: true,
      forwardedFrom: typeof originalMessage.senderId === 'object' ? (originalMessage.senderId as any)._id : originalMessage.senderId,
      seenBy: [{ userId, timestamp: new Date() }],
      deliveredTo: [{ userId, timestamp: new Date() }],
    });

    const populated = await Message.findById(forwardedMsg._id)
      .populate('senderId', 'name username profilePic')
      .populate('forwardedFrom', 'name username profilePic');

    // Broadcast via socket
    const io = req.app.get('io');
    if (io) {
      if (targetChatId) {
        io.to(targetChatId.toString()).emit('message:receive', populated);
      } else if (targetGroupId) {
        io.to(`group:${targetGroupId}`).emit('group:message-receive', { groupId: targetGroupId, message: populated });
      }
    }

    return res.status(201).json({ success: true, message: populated });
  } catch (error) {
    console.error('Forward Message Error:', error);
    return res.status(500).json({ message: 'Failed to forward message.' });
  }
};

export const searchMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { query, partnerId, groupId } = req.query;
    const userId = req.userId;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'Search query is required.' });
    }

    let filter: any = {
      content: { $regex: query, $options: 'i' },
      deletedFor: { $ne: userId },
      isDeletedForEveryone: { $ne: true },
    };

    if (partnerId) {
      filter.$or = [
        { senderId: userId, chatId: partnerId },
        { senderId: partnerId, chatId: userId },
      ];
    } else if (groupId) {
      filter.groupId = groupId;
    }

    const messages = await Message.find(filter)
      .populate('senderId', 'name username profilePic')
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error('Search Messages Error:', error);
    return res.status(500).json({ message: 'Failed to search messages.' });
  }
};
