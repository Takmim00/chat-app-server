import { Server, Socket } from 'socket.io';
import Group from '../models/Group.js';
import Message from '../models/Message.js';

export const handleGroupSockets = (
  io: Server,
  socket: Socket,
  onlineUsers: Map<string, string>
) => {
  const currentUserId = socket.data.userId;

  // Join group Socket room
  socket.on('group:join', ({ groupId }) => {
    socket.join(`group:${groupId}`);
    console.log(`[Group Socket] User ${currentUserId} joined room group:${groupId}`);
  });

  // Leave group room
  socket.on('group:leave', ({ groupId }) => {
    socket.leave(`group:${groupId}`);
  });

  // Group Message Send
  socket.on('group:message-send', ({ groupId, message }) => {
    socket.to(`group:${groupId}`).emit('group:message-receive', { groupId, message });
  });

  // Group Typing Indicator
  socket.on('group:typing', ({ groupId, isTyping, userName }) => {
    socket.to(`group:${groupId}`).emit('group:typing', {
      groupId,
      userId: currentUserId,
      userName,
      isTyping,
    });
  });

  // Group Voice Calls (WebRTC Mesh signaling)
  socket.on('group:call-start', async ({ groupId }) => {
    const group = await Group.findById(groupId);
    if (!group) return;

    socket.to(`group:${groupId}`).emit('group:call-incoming', {
      groupId,
      groupName: group.name,
      initiatorId: currentUserId,
    });
  });

  socket.on('group:call-join', ({ groupId, userInfo }) => {
    socket.join(`group-call:${groupId}`);
    // Notify other participants in call room
    socket.to(`group-call:${groupId}`).emit('group:user-joined-call', {
      groupId,
      userId: currentUserId,
      socketId: socket.id,
      userInfo,
    });
  });

  socket.on('group:call-leave', ({ groupId }) => {
    socket.leave(`group-call:${groupId}`);
    socket.to(`group-call:${groupId}`).emit('group:user-left-call', {
      groupId,
      userId: currentUserId,
    });
  });

  // Group WebRTC Peer Exchanges
  socket.on('group:signal', ({ toSocketId, signalData }) => {
    io.to(toSocketId).emit('group:signal', {
      fromSocketId: socket.id,
      fromUserId: currentUserId,
      signalData,
    });
  });
};
