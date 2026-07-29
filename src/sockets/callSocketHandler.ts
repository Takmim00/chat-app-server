import { Server, Socket } from 'socket.io';
import CallLog from '../models/CallLog.js';

export const handleCallSockets = (
  io: Server,
  socket: Socket,
  onlineUsers: Map<string, string>
) => {
  const currentUserId = socket.data.userId;

  // Initiate call
  socket.on('call:initiate', ({ receiverId, callerInfo }) => {
    const receiverSocketId = onlineUsers.get(receiverId);

    if (!receiverSocketId) {
      // Receiver offline
      socket.emit('call:unavailable', { message: 'User is currently offline.' });
      return;
    }

    // Send incoming call notification to receiver
    io.to(receiverSocketId).emit('call:incoming', {
      callerId: currentUserId,
      callerInfo,
      callType: 'voice',
    });

    // Notify caller that receiver is ringing
    socket.emit('call:ringing', { receiverId });
  });

  // Accept Call
  socket.on('call:accept', ({ callerId }) => {
    const callerSocketId = onlineUsers.get(callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:accepted', { receiverId: currentUserId });
    }
  });

  // Reject Call
  socket.on('call:reject', async ({ callerId }) => {
    const callerSocketId = onlineUsers.get(callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:rejected', { receiverId: currentUserId });
    }
    // Record rejected call log
    await CallLog.create({
      callerId,
      receiverId: currentUserId,
      isGroupCall: false,
      status: 'rejected',
    });
  });

  // End Call
  socket.on('call:end', async ({ partnerId, duration }) => {
    const partnerSocketId = onlineUsers.get(partnerId);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('call:ended', { endedBy: currentUserId });
    }
    // Log call completion
    await CallLog.create({
      callerId: currentUserId,
      receiverId: partnerId,
      isGroupCall: false,
      duration: duration || 0,
      status: 'completed',
    });
  });

  // WebRTC Signaling Exchanges
  socket.on('call:offer', ({ to, offer }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:offer', { from: currentUserId, offer });
    }
  });

  socket.on('call:answer', ({ to, answer }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:answer', { from: currentUserId, answer });
    }
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:ice-candidate', { from: currentUserId, candidate });
    }
  });
};
