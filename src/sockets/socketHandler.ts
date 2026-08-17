import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import { handleCallSockets, flushSignalQueue } from './callSocketHandler.js';
import { handleGroupSockets } from './groupSocketHandler.js';

export const onlineUsers = new Map<string, string>(); // userId -> socketId

export const setupSocketIO = (io: Server) => {
  // Auth middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication token required'));
      const decoded = verifyToken(token);
      socket.data.userId = decoded.userId.toString();
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    if (!userId) return;

    // Evict any previous socket from the user's room — only 1 active socket per user
    const previousSocketId = onlineUsers.get(userId);
    if (previousSocketId && previousSocketId !== socket.id) {
      console.log(`[Socket] Evicting old socket ${previousSocketId} from room ${userId}`);
      const prevSocket = io.sockets.sockets.get(previousSocketId);
      if (prevSocket) {
        prevSocket.leave(userId);
      }
    }

    // Register this socket as the active one
    onlineUsers.set(userId, socket.id);
    socket.join(userId);

    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
    io.emit('user:online', { userId, isOnline: true });

    console.log(`[Socket Connected] User ${userId} | SocketId ${socket.id}`);

    // ── Flush any queued signals this user missed while reconnecting ──────────
    flushSignalQueue(io, userId);

    // ── Direct Messaging ──────────────────────────────────────────────────────
    socket.on('message:send', async (data) => {
      const { receiverId, message } = data;
      if (!receiverId) return;
      io.to(receiverId.toString()).emit('message:receive', message);
      socket.emit('message:delivered', { messageId: message._id, receiverId });
    });

    socket.on('typing:start', ({ receiverId }) => {
      if (receiverId) io.to(receiverId.toString()).emit('typing:start', { senderId: userId });
    });

    socket.on('typing:stop', ({ receiverId }) => {
      if (receiverId) io.to(receiverId.toString()).emit('typing:stop', { senderId: userId });
    });

    socket.on('message:seen', async ({ messageId, senderId }) => {
      // Skip temp client-side IDs that aren't valid MongoDB ObjectIds
      if (!messageId || !mongoose.isValidObjectId(messageId)) return;

      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { seenBy: { userId, timestamp: new Date() } },
      });
      if (senderId) {
        io.to(senderId.toString()).emit('message:seen', { messageId, seenByUserId: userId });
      }
    });

    // Register sub-handlers
    handleCallSockets(io, socket, onlineUsers);
    handleGroupSockets(io, socket, onlineUsers);

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket Disconnected] User ${userId} | Socket ${socket.id} | Reason: ${reason}`);

      // Only mark offline if this is STILL the active socket for this user
      if (onlineUsers.get(userId) === socket.id) {
        onlineUsers.delete(userId);
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
        io.emit('user:offline', { userId, isOnline: false, lastSeen: new Date() });
        console.log(`[Socket] User ${userId} marked OFFLINE`);
      } else {
        console.log(`[Socket] User ${userId} has newer socket — NOT marking offline`);
      }
    });
  });
};
