import { Server, Socket } from 'socket.io';
import CallLog from '../models/CallLog.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

export const handleCallSockets = (
  io: Server,
  socket: Socket,
  onlineUsers: Map<string, string>
) => {
  const currentUserId = socket.data.userId;

  // Helper: emit event to user room once
  const emitToUser = (targetUserId: string, event: string, payload: any) => {
    if (!targetUserId) return;
    const room = targetUserId.toString();
    io.to(room).emit(event, payload);
    console.log(`[Call Socket] "${event}" -> room ${room}`);
  };

  // Initiate call — notify receiver
  socket.on('call:initiate', async ({ receiverId, callerInfo }) => {
    if (!receiverId) return;
    const targetRoom = receiverId.toString();
    console.log(`[Call Initiate] From ${currentUserId} -> ${targetRoom}`);

    let immediateCaller = {
      _id: callerInfo?._id?.toString?.() || currentUserId,
      name: callerInfo?.name || callerInfo?.username || 'Unknown Caller',
      username: callerInfo?.username || callerInfo?.name || '',
      profilePic: callerInfo?.profilePic || '',
      friendId: callerInfo?.friendId || '',
      email: callerInfo?.email || '',
    };

    // Enrich caller info from DB if possible
    try {
      const dbCaller = await User.findById(currentUserId).select('name username profilePic friendId');
      if (dbCaller) {
        immediateCaller = {
          _id: dbCaller._id.toString(),
          name: dbCaller.name || immediateCaller.name,
          username: dbCaller.username || immediateCaller.username,
          profilePic: dbCaller.profilePic || immediateCaller.profilePic,
          friendId: dbCaller.friendId || immediateCaller.friendId,
          email: '',
        };
      }
    } catch (e) {}

    const payload = {
      callerId: currentUserId,
      callerInfo: immediateCaller,
      callType: 'voice',
      targetReceiverId: targetRoom,
      receiverId: targetRoom,
    };

    // Emit single call:incoming event to receiver room
    emitToUser(targetRoom, 'call:incoming', payload);
    socket.emit('call:ringing', { receiverId: targetRoom });
  });

  // Accept Call
  socket.on('call:accept', ({ callerId }) => {
    if (!callerId) return;
    const targetRoom = callerId.toString();
    const payload = { receiverId: currentUserId, callerId: targetRoom, targetCallerId: targetRoom };
    console.log(`[Call Accept] ${currentUserId} -> caller ${targetRoom}`);
    emitToUser(targetRoom, 'call:accepted', payload);
  });

  // Reject Call
  socket.on('call:reject', async ({ callerId }) => {
    if (!callerId) return;
    const targetRoom = callerId.toString();
    const payload = { receiverId: currentUserId, callerId: targetRoom, targetCallerId: targetRoom };
    console.log(`[Call Reject] ${currentUserId} -> caller ${targetRoom}`);
    emitToUser(targetRoom, 'call:rejected', payload);

    await CallLog.create({ callerId, receiverId: currentUserId, isGroupCall: false, status: 'rejected' }).catch(() => {});

    // Save a missed/rejected call message in chat
    try {
      const callMsg = await Message.create({
        chatId: currentUserId,
        senderId: callerId,
        type: 'call',
        content: 'Missed audio call',
        callDuration: 0,
        callStatus: 'missed',
      });
      const populated = await callMsg.populate('senderId', 'name username profilePic');
      io.to(currentUserId).emit('message:receive', populated);
      io.to(targetRoom).emit('message:receive', populated);
    } catch (err) {
      console.error('[Call] Failed to save missed call message:', err);
    }
  });

  // End Call
  socket.on('call:end', async ({ partnerId, duration }) => {
    if (!partnerId) return;
    const targetRoom = partnerId.toString();
    const payload = { endedBy: currentUserId, partnerId: targetRoom, targetPartnerId: targetRoom };
    console.log(`[Call End] ${currentUserId} -> partner ${targetRoom}`);
    emitToUser(targetRoom, 'call:ended', payload);

    // Save CallLog
    await CallLog.create({
      callerId: currentUserId,
      receiverId: partnerId,
      isGroupCall: false,
      duration: duration || 0,
      status: 'completed',
    }).catch(() => {});

    // Save a call-type message to both users' chat
    try {
      const callMsg = await Message.create({
        chatId: partnerId,
        senderId: currentUserId,
        type: 'call',
        content: duration > 0 ? `Audio call \u00b7 ${Math.ceil(duration / 60)} min${Math.ceil(duration / 60) !== 1 ? 's' : ''}` : 'Audio call',
        callDuration: duration || 0,
        callStatus: 'completed',
      });

      const populated = await callMsg.populate('senderId', 'name username profilePic');
      io.to(currentUserId).emit('message:receive', populated);
      io.to(targetRoom).emit('message:receive', populated);
    } catch (err) {
      console.error('[Call] Failed to save call message:', err);
    }
  });
};

export function flushSignalQueue(_io: Server, _userId: string) {
  // Empty signal queue —ZEGOCloud manages streaming room connections
}
