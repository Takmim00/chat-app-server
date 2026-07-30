import { Server, Socket } from 'socket.io';
import CallLog from '../models/CallLog.js';
import User from '../models/User.js';

export const handleCallSockets = (
  io: Server,
  socket: Socket,
  onlineUsers: Map<string, string>
) => {
  const currentUserId = socket.data.userId;

  // Helper: emit to a target user via BOTH room and direct socket ID
  const emitToUser = (targetUserId: string, event: string, payload: any) => {
    const targetRoom = targetUserId.toString();
    const targetSocketId = onlineUsers.get(targetRoom);
    
    // Method 1: Room-based emission
    io.to(targetRoom).emit(event, payload);
    
    // Method 2: Direct socket ID fallback
    if (targetSocketId) {
      io.to(targetSocketId).emit(event, payload);
    }
    
    console.log(`[Call Emit] Event "${event}" -> user ${targetRoom} (socketId: ${targetSocketId || 'N/A'})`);
  };

  // Initiate call — emit IMMEDIATELY, then enrich caller info async
  socket.on('call:initiate', ({ receiverId, callerInfo }) => {
    if (!receiverId) return;
    const targetRoom = receiverId.toString();

    console.log(`[Socket Call Initiate] From ${currentUserId} to ${targetRoom}`);

    // Build caller info from whatever the client sent — emit INSTANTLY (no async delay)
    const immediateCaller = {
      _id: callerInfo?._id?.toString?.() || callerInfo?._id || currentUserId,
      name: callerInfo?.name || callerInfo?.username || 'Unknown Caller',
      username: callerInfo?.username || callerInfo?.name || '',
      profilePic: callerInfo?.profilePic || '',
      friendId: callerInfo?.friendId || '',
      email: callerInfo?.email || '',
    };

    const payload = {
      callerId: currentUserId,
      callerInfo: immediateCaller,
      callType: 'voice',
      targetReceiverId: targetRoom,
      receiverId: targetRoom,
    };

    // Emit call:incoming IMMEDIATELY — no async delay
    emitToUser(targetRoom, 'call:incoming', payload);
    socket.emit('call:ringing', { receiverId: targetRoom });

    // Optionally enrich caller info from DB in background (no await)
    User.findById(currentUserId).select('name username profilePic friendId').then((dbCaller) => {
      if (dbCaller) {
        const enrichedPayload = {
          ...payload,
          callerInfo: {
            _id: dbCaller._id?.toString() || currentUserId,
            name: dbCaller.name || immediateCaller.name,
            username: dbCaller.username || immediateCaller.username,
            profilePic: dbCaller.profilePic || immediateCaller.profilePic,
            friendId: dbCaller.friendId || immediateCaller.friendId,
            email: '',
          },
        };
        // Send enriched info as an update (client will use latest)
        emitToUser(targetRoom, 'call:incoming', enrichedPayload);
      }
    }).catch(() => {});
  });

  // Accept Call
  socket.on('call:accept', ({ callerId }) => {
    if (!callerId) return;
    const targetRoom = callerId.toString();
    const payload = {
      receiverId: currentUserId,
      callerId: targetRoom,
      targetCallerId: targetRoom,
    };

    console.log(`[Socket Call Accept] From ${currentUserId} to caller ${targetRoom}`);
    emitToUser(targetRoom, 'call:accepted', payload);
  });

  // Reject Call
  socket.on('call:reject', async ({ callerId }) => {
    if (!callerId) return;
    const targetRoom = callerId.toString();
    const payload = {
      receiverId: currentUserId,
      callerId: targetRoom,
      targetCallerId: targetRoom,
    };

    console.log(`[Socket Call Reject] From ${currentUserId} to caller ${targetRoom}`);
    emitToUser(targetRoom, 'call:rejected', payload);

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
    const payload = {
      endedBy: currentUserId,
      partnerId: targetRoom,
      targetPartnerId: targetRoom,
    };

    console.log(`[Socket Call End] From ${currentUserId} to partner ${targetRoom}`);
    // Only emit to the PARTNER — NOT back to the caller
    emitToUser(targetRoom, 'call:ended', payload);

    await CallLog.create({
      callerId: currentUserId,
      receiverId: partnerId,
      isGroupCall: false,
      duration: duration || 0,
      status: 'completed',
    }).catch(() => {});
  });

  // WebRTC Signaling — room + direct socket ID
  socket.on('call:offer', ({ to, offer }) => {
    if (!to) return;
    const targetRoom = to.toString();
    const payload = { from: currentUserId, to: targetRoom, offer, targetReceiverId: targetRoom };
    emitToUser(targetRoom, 'call:offer', payload);
  });

  socket.on('call:answer', ({ to, answer }) => {
    if (!to) return;
    const targetRoom = to.toString();
    const payload = { from: currentUserId, to: targetRoom, answer, targetReceiverId: targetRoom };
    emitToUser(targetRoom, 'call:answer', payload);
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    if (!to) return;
    const targetRoom = to.toString();
    const payload = { from: currentUserId, to: targetRoom, candidate, targetReceiverId: targetRoom };
    emitToUser(targetRoom, 'call:ice-candidate', payload);
  });
};
