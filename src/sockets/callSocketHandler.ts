import { Server, Socket } from 'socket.io';
import CallLog from '../models/CallLog.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// ── Server-side signal queue ─────────────────────────────────────────────────
// Stores pending WebRTC signals for users who are temporarily offline/reconnecting.
// Signals are cleared after 30 seconds (call setup window) or when delivered.
interface QueuedSignal {
  event: string;
  payload: any;
  timestamp: number;
}
const signalQueue = new Map<string, QueuedSignal[]>(); // targetUserId -> signals

function queueSignal(targetUserId: string, event: string, payload: any) {
  const queue = signalQueue.get(targetUserId) || [];
  // Limit queue to 50 items per user, clean up old entries (> 30s)
  const now = Date.now();
  const fresh = queue.filter((s) => now - s.timestamp < 30000);
  fresh.push({ event, payload, timestamp: now });
  signalQueue.set(targetUserId, fresh);
}

export function flushSignalQueue(io: Server, userId: string) {
  const queue = signalQueue.get(userId);
  if (!queue || queue.length === 0) return;

  const now = Date.now();
  queue
    .filter((s) => now - s.timestamp < 30000)
    .forEach((s) => {
      io.to(userId).emit(s.event, s.payload);
      console.log(`[Signal Queue] Flushed "${s.event}" to user ${userId}`);
    });
  signalQueue.delete(userId);
}

export const handleCallSockets = (
  io: Server,
  socket: Socket,
  onlineUsers: Map<string, string>
) => {
  const currentUserId = socket.data.userId;

  // Helper: emit to user's room AND queue if they're temporarily offline
  const emitToUser = (targetUserId: string, event: string, payload: any) => {
    if (!targetUserId) return;
    const room = targetUserId.toString();
    io.to(room).emit(event, payload);
    console.log(`[Call Socket] "${event}" -> room ${room}`);
    // Also queue it in case the socket just reconnected and missed it
    queueSignal(room, event, payload);
  };

  // Initiate call
  socket.on('call:initiate', ({ receiverId, callerInfo }) => {
    if (!receiverId) return;
    const targetRoom = receiverId.toString();
    console.log(`[Call Initiate] From ${currentUserId} -> ${targetRoom}`);

    const immediateCaller = {
      _id: callerInfo?._id?.toString?.() || currentUserId,
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

    emitToUser(targetRoom, 'call:incoming', payload);
    socket.emit('call:ringing', { receiverId: targetRoom });

    User.findById(currentUserId).select('name username profilePic friendId').then((dbCaller) => {
      if (!dbCaller) return;
      const enriched = {
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
      emitToUser(targetRoom, 'call:incoming', enriched);
    }).catch(() => {});
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
        chatId: currentUserId,    // conversation between caller and receiver
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
    io.to(targetRoom).emit('call:ended', payload); // Don't queue this — intentional end

    // Save CallLog
    await CallLog.create({
      callerId: currentUserId,
      receiverId: partnerId,
      isGroupCall: false,
      duration: duration || 0,
      status: 'completed',
    }).catch(() => {});

    // Save a call-type message to both users' chat so it appears in chat history
    try {
      const callMsg = await Message.create({
        chatId: partnerId,       // used as the conversation identifier
        senderId: currentUserId,
        type: 'call',
        content: duration > 0 ? `Audio call \u00b7 ${Math.ceil(duration / 60)} min${Math.ceil(duration / 60) !== 1 ? 's' : ''}` : 'Audio call',
        callDuration: duration || 0,
        callStatus: 'completed',
      });

      const populated = await callMsg.populate('senderId', 'name username profilePic');

      // Emit to both caller and receiver so it appears in their chat
      io.to(currentUserId).emit('message:receive', populated);
      io.to(targetRoom).emit('message:receive', populated);
    } catch (err) {
      console.error('[Call] Failed to save call message:', err);
    }
  });

  // WebRTC Offer — most critical: queue for reconnecting receiver
  socket.on('call:offer', ({ to, offer }) => {
    if (!to || !offer) return;
    const targetRoom = to.toString();
    const payload = { from: currentUserId, to: targetRoom, offer, targetReceiverId: targetRoom };
    emitToUser(targetRoom, 'call:offer', payload);
  });

  // WebRTC Answer
  socket.on('call:answer', ({ to, answer }) => {
    if (!to || !answer) return;
    const targetRoom = to.toString();
    const payload = { from: currentUserId, to: targetRoom, answer, targetReceiverId: targetRoom };
    emitToUser(targetRoom, 'call:answer', payload);
  });

  // WebRTC ICE Candidate
  socket.on('call:ice-candidate', ({ to, candidate }) => {
    if (!to || !candidate) return;
    const targetRoom = to.toString();
    const payload = { from: currentUserId, to: targetRoom, candidate, targetReceiverId: targetRoom };
    io.to(targetRoom).emit('call:ice-candidate', payload); // Don't queue ICE — volume too high
  });
};
