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

    // Always fetch caller info from DB to guarantee completeness
    let fullCaller = callerInfo;
    try {
      const dbCaller = await User.findById(currentUserId).select('name username profilePic friendId');
      if (dbCaller) {
        fullCaller = {
          _id: dbCaller._id?.toString() || currentUserId,
          name: dbCaller.name || callerInfo?.name || 'Unknown',
          username: dbCaller.username || callerInfo?.username || '',
          profilePic: dbCaller.profilePic || callerInfo?.profilePic || '',
          friendId: dbCaller.friendId || callerInfo?.friendId || '',
        };
      }
    } catch (err) {
      console.error('[Call Initiate] Failed to fetch caller info from DB:', err);
      // Ensure fallback callerInfo always has required fields
      if (!fullCaller || !fullCaller.name) {
        fullCaller = {
          _id: currentUserId,
          name: callerInfo?.name || callerInfo?.username || 'Unknown Caller',
          username: callerInfo?.username || '',
          profilePic: callerInfo?.profilePic || '',
        };
      }
    }

    const targetSocketId = onlineUsers.get(targetRoom);
    console.log(`[Socket Call Initiate] From ${currentUserId} to targetRoom ${targetRoom}, targetSocket: ${targetSocketId}`);

    const payload = {
      callerId: currentUserId,
      callerInfo: fullCaller,
      callType: 'voice',
      targetReceiverId: targetRoom,
      receiverId: targetRoom,
    };

    // Emit to the targeted receiver's room
    io.to(targetRoom).emit('call:incoming', payload);
    // Also emit directly to their socket ID as fallback (in case room emission fails)
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:incoming', payload);
    }
    socket.emit('call:ringing', { receiverId: targetRoom });
  });

  // Accept Call
  socket.on('call:accept', ({ callerId }) => {
    if (!callerId) return;
    const targetRoom = callerId.toString();
    const targetSocketId = onlineUsers.get(targetRoom);
    const payload = {
      receiverId: currentUserId,
      callerId: targetRoom,
      targetCallerId: targetRoom,
    };

    console.log(`[Socket Call Accept] From ${currentUserId} to caller ${targetRoom}`);
    io.to(targetRoom).emit('call:accepted', payload);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:accepted', payload);
    }
  });

  // Reject Call
  socket.on('call:reject', async ({ callerId }) => {
    if (!callerId) return;
    const targetRoom = callerId.toString();
    const targetSocketId = onlineUsers.get(targetRoom);
    const payload = {
      receiverId: currentUserId,
      callerId: targetRoom,
      targetCallerId: targetRoom,
    };

    console.log(`[Socket Call Reject] From ${currentUserId} to caller ${targetRoom}`);
    io.to(targetRoom).emit('call:rejected', payload);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:rejected', payload);
    }

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
    const targetSocketId = onlineUsers.get(targetRoom);
    const payload = {
      endedBy: currentUserId,
      partnerId: targetRoom,
      targetPartnerId: targetRoom,
    };

    console.log(`[Socket Call End] From ${currentUserId} to partner ${targetRoom}`);
    // Only emit to the PARTNER — NOT back to the caller who initiated the end
    io.to(targetRoom).emit('call:ended', payload);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:ended', payload);
    }

    await CallLog.create({
      callerId: currentUserId,
      receiverId: partnerId,
      isGroupCall: false,
      duration: duration || 0,
      status: 'completed',
    }).catch(() => {});
  });

  // WebRTC Signaling Exchanges — room + direct socket ID fallback
  socket.on('call:offer', ({ to, offer }) => {
    if (!to) return;
    const targetRoom = to.toString();
    const targetSocketId = onlineUsers.get(targetRoom);
    const payload = { from: currentUserId, to: targetRoom, offer, targetReceiverId: targetRoom };
    io.to(targetRoom).emit('call:offer', payload);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:offer', payload);
    }
  });

  socket.on('call:answer', ({ to, answer }) => {
    if (!to) return;
    const targetRoom = to.toString();
    const targetSocketId = onlineUsers.get(targetRoom);
    const payload = { from: currentUserId, to: targetRoom, answer, targetReceiverId: targetRoom };
    io.to(targetRoom).emit('call:answer', payload);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:answer', payload);
    }
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    if (!to) return;
    const targetRoom = to.toString();
    const targetSocketId = onlineUsers.get(targetRoom);
    const payload = { from: currentUserId, to: targetRoom, candidate, targetReceiverId: targetRoom };
    io.to(targetRoom).emit('call:ice-candidate', payload);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:ice-candidate', payload);
    }
  });
};
