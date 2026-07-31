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

    // If this user had a previous socket registered, evict it from the room
    // so the room contains ONLY the current, active socket
    const previousSocketId = onlineUsers.get(userId);
    if (previousSocketId && previousSocketId !== socket.id) {
      console.log(`[Socket] User ${userId} reconnected — evicting old socket ${previousSocketId} from room`);
      const prevSocket = io.sockets.sockets.get(previousSocketId);
      if (prevSocket) {
        // Remove old socket from the user's room so it no longer receives events
        prevSocket.leave(userId);
      }
    }

    // Register this socket as the active one for this user
    onlineUsers.set(userId, socket.id);
    socket.join(userId);

    // Update user online status in DB
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
    io.emit('user:online', { userId, isOnline: true });

    console.log(`[Socket Connected] User ${userId} | SocketId ${socket.id} | Room: ${userId}`);

    // Direct Messaging Events
    socket.on('message:send', async (data) => {
      const { receiverId, message } = data;
      if (!receiverId) return;

      const targetId = receiverId.toString();
      io.to(targetId).emit('message:receive', message);
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

    socket.on('disconnect', async (reason) => {
      console.log(`[Socket Disconnected] User ${userId} | Socket ${socket.id} | Reason: ${reason}`);

      // Only mark offline if THIS socket is still the most recently registered one
      // If user reconnected, a new socket is already registered — don't mark them offline
      if (onlineUsers.get(userId) === socket.id) {
        onlineUsers.delete(userId);
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
        io.emit('user:offline', { userId, isOnline: false, lastSeen: new Date() });
        console.log(`[Socket] User ${userId} is now OFFLINE`);
      } else {
        console.log(`[Socket] User ${userId} has a newer socket registered — NOT marking offline`);
      }
    });
  });
};
