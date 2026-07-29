import { Server, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import { handleCallSockets } from './callSocketHandler.js';
import { handleGroupSockets } from './groupSocketHandler.js';

export const onlineUsers = new Map<string, string>(); // userId -> socketId

export const setupSocketIO = (io: Server) => {
  // Middleware for socket auth
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        return next(new Error('Authentication token required'));
      }
      const decoded = verifyToken(token);
      socket.data.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    if (!userId) return;

    onlineUsers.set(userId, socket.id);
    socket.join(userId);

    // Update user online status
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
    io.emit('user:online', { userId, isOnline: true, lastSeen: new Date() });

    console.log(`[Socket Connected] User ${userId} with Socket ID ${socket.id}`);

    // Direct Messaging Events
    socket.on('message:send', async (data) => {
      const { receiverId, message } = data;
      const receiverSocketId = onlineUsers.get(receiverId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('message:receive', message);
        // Automatically mark as delivered if receiver is online
        io.to(socket.id).emit('message:delivered', { messageId: message._id, receiverId });
      }
    });

    socket.on('typing:start', ({ receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing:start', { senderId: userId });
      }
    });

    socket.on('typing:stop', ({ receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing:stop', { senderId: userId });
      }
    });

    socket.on('message:seen', async ({ messageId, senderId }) => {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { seenBy: { userId, timestamp: new Date() } },
      });
      const senderSocketId = onlineUsers.get(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('message:seen', { messageId, seenByUserId: userId });
      }
    });

    // Register Call & Group Sub-handlers
    handleCallSockets(io, socket, onlineUsers);
    handleGroupSockets(io, socket, onlineUsers);

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user:offline', { userId, isOnline: false, lastSeen: new Date() });
      console.log(`[Socket Disconnected] User ${userId}`);
    });
  });
};
