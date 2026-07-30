import { Server, Socket } from 'socket.io';
import CallLog from '../models/CallLog.js';
import User from '../models/User.js';

export const handleCallSockets = (
  io: Server,
  socket: Socket,
  onlineUsers: Map<string, string>
) => {
  const currentUserId = socket.data.userId;

  // Initiate call
  socket.on('call:initiate', async ({ receiverId, callerInfo }) => {
    if (!receiverId) return;
    const targetRoom = receiverId.toString();

    let fullCaller = callerInfo;
    if (!fullCaller || !fullCaller._id || !fullCaller.name) {
      try {
        const dbCaller = await User.findById(currentUserId).select('name username profilePic friendId');
        if (dbCaller) fullCaller = dbCaller;
      } catch (err) {
        console.error('Failed to fetch caller info:', err);
      }
    }

    const targetSocketId = onlineUsers.get(targetRoom);
    console.log(`[Socket Call Initiate] From ${currentUserId} to room ${targetRoom}, targetSocket: ${targetSocketId}`);

    // Send incoming call notification to target receiver user room & socket ID
    io.to(targetRoom).emit('call:incoming', {
      callerId: currentUserId,
      callerInfo: fullCaller,
      callType: 'voice',
    });

    if (targetSocketId) {
      io.to(targetSocketId).emit('call:incoming', {
        callerId: currentUserId,
        callerInfo: fullCaller,
        callType: 'voice',
      });
    }

    // Notify caller that receiver is ringing
    socket.emit('call:ringing', { receiverId: targetRoom });
  });

  // Accept Call
  socket.on('call:accept', ({ callerId }) => {
    if (!callerId) return;
    io.to(callerId.toString()).emit('call:accepted', { receiverId: currentUserId });
  });

  // Reject Call
  socket.on('call:reject', async ({ callerId }) => {
    if (!callerId) return;
    io.to(callerId.toString()).emit('call:rejected', { receiverId: currentUserId });
    await CallLog.create({
      callerId,
      receiverId: currentUserId,
      isGroupCall: false,
      status: 'rejected',
    }).catch(() => {});
  });

  // End Call
  socket.on('call:end', async ({ partnerId, duration }) => {
    if (!partnerId) return;
    io.to(partnerId.toString()).emit('call:ended', { endedBy: currentUserId });
    await CallLog.create({
      callerId: currentUserId,
      receiverId: partnerId,
      isGroupCall: false,
      duration: duration || 0,
      status: 'completed',
    }).catch(() => {});
  });

  // WebRTC Signaling Exchanges
  socket.on('call:offer', ({ to, offer }) => {
    if (!to) return;
    io.to(to.toString()).emit('call:offer', { from: currentUserId, offer });
  });

  socket.on('call:answer', ({ to, answer }) => {
    if (!to) return;
    io.to(to.toString()).emit('call:answer', { from: currentUserId, answer });
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    if (!to) return;
    io.to(to.toString()).emit('call:ice-candidate', { from: currentUserId, candidate });
  });
};
