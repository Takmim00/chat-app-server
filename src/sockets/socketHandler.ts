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
      socket.data.userId = decoded.userId.toString();
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    if (!userId) return;

    // Register user in room & online map
    onlineUsers.set(userId, socket.id);
    socket.join(userId);

    // Update user online status
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
    io.emit('user:online', { userId, isOnline: true, lastSeen: new Date() });

    console.log(`[Socket Connected] User ${userId} joined room ${userId} with Socket ID ${socket.id}`);

    // Direct Messaging Events (Emit to target user room + socket ID)
    socket.on('message:send', async (data) => {
      const { receiverId, message } = data;
      if (!receiverId) return;

      const targetId = receiverId.toString();
      console.log(`[Socket message:send] From ${userId} to target room ${targetId}`);

      // Emit to room (reaches all open tabs of receiver)
      io.to(targetId).emit('message:receive', message);

      // Notify sender of delivery confirmation
      socket.emit('message:delivered', { messageId: message._id, receiverId: targetId });
    });

    socket.on('typing:start', ({ receiverId }) => {
      if (!receiverId) return;
      io.to(receiverId.toString()).emit('typing:start', { senderId: userId });
    });

    socket.on('typing:stop', ({ receiverId }) => {
      if (!receiverId) return;
      io.to(receiverId.toString()).emit('typing:stop', { senderId: userId });
    });

    socket.on('message:seen', async ({ messageId, senderId }) => {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { seenBy: { userId, timestamp: new Date() } },
      });
      if (senderId) {
        io.to(senderId.toString()).emit('message:seen', { messageId, seenByUserId: userId });
      }
    });

    // Register Call & Group Sub-handlers
    handleCallSockets(io, socket, onlineUsers);
    handleGroupSockets(io, socket, onlineUsers);

    socket.on('disconnect', async () => {
      // Only remove from onlineUsers if THIS socket is still the registered one
      // (prevents race condition where a reconnected socket's entry gets deleted by the old socket)
      if (onlineUsers.get(userId) === socket.id) {
        onlineUsers.delete(userId);
      }
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user:offline', { userId, isOnline: false, lastSeen: new Date() });
      console.log(`[Socket Disconnected] User ${userId} (Socket ${socket.id})`);
    });
  });
};
