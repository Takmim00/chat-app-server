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
    console.log(`[Socket Call Initiate] From ${currentUserId} to targetRoom ${targetRoom}, targetSocket: ${targetSocketId}`);

    // 1. Direct room emit
    io.to(targetRoom).emit('call:incoming', {
      callerId: currentUserId,
      callerInfo: fullCaller,
      callType: 'voice',
      targetReceiverId: targetRoom,
    });

    // 2. Socket ID emit
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:incoming', {
        callerId: currentUserId,
        callerInfo: fullCaller,
        callType: 'voice',
        targetReceiverId: targetRoom,
      });
    }

    // 3. Fail-safe broadcast emit with target filtering
    socket.broadcast.emit('call:incoming', {
      callerId: currentUserId,
      callerInfo: fullCaller,
      callType: 'voice',
      targetReceiverId: targetRoom,
    });

    // Notify caller that receiver is ringing
    socket.emit('call:ringing', { receiverId: targetRoom });
  });

  // Accept Call
  socket.on('call:accept', ({ callerId }) => {
    if (!callerId) return;
    const targetRoom = callerId.toString();
    const payload = { receiverId: currentUserId, targetCallerId: targetRoom };

    io.to(targetRoom).emit('call:accepted', payload);
    socket.broadcast.emit('call:accepted', payload);
  });

  // Reject Call
  socket.on('call:reject', async ({ callerId }) => {
    if (!callerId) return;
    const targetRoom = callerId.toString();
    const payload = { receiverId: currentUserId, targetCallerId: targetRoom };

    io.to(targetRoom).emit('call:rejected', payload);
    socket.broadcast.emit('call:rejected', payload);

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
    const targetRoom = partnerId.toString();
    const payload = { endedBy: currentUserId, targetPartnerId: targetRoom };

    io.to(targetRoom).emit('call:ended', payload);
    socket.broadcast.emit('call:ended', payload);

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
    const targetRoom = to.toString();
    const payload = { from: currentUserId, offer, targetReceiverId: targetRoom };

    io.to(targetRoom).emit('call:offer', payload);
    socket.broadcast.emit('call:offer', payload);
  });

  socket.on('call:answer', ({ to, answer }) => {
    if (!to) return;
    const targetRoom = to.toString();
    const payload = { from: currentUserId, answer, targetReceiverId: targetRoom };

    io.to(targetRoom).emit('call:answer', payload);
    socket.broadcast.emit('call:answer', payload);
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    if (!to) return;
    const targetRoom = to.toString();
    const payload = { from: currentUserId, candidate, targetReceiverId: targetRoom };

    io.to(targetRoom).emit('call:ice-candidate', payload);
    socket.broadcast.emit('call:ice-candidate', payload);
  });
};
