/**
 * Call Notification & Signaling Handler
 * Manages incoming/outgoing call notifications, ringtone triggers, and call state
 */

module.exports = (io) => {
  io.on('connection', (socket) => {

    // Initiate a call to another user
    socket.on('call:initiate', ({ targetUserId, callType, sessionId, callerInfo }) => {
      console.log(`📞 Call initiated: ${socket.user.id} → ${targetUserId} (${callType})`);

      // Notify target user of incoming call
      io.to(`user:${targetUserId}`).emit('call:incoming', {
        callId: `call-${Date.now()}-${socket.user.id}`,
        callerId: socket.user.id,
        callerName: callerInfo?.name || socket.user.name,
        callerPhoto: callerInfo?.photo || null,
        callType, // 'video' | 'audio'
        sessionId,
        timestamp: new Date().toISOString(),
      });
    });

    // Accept call
    socket.on('call:accept', ({ callId, callerId }) => {
      console.log(`✅ Call accepted: ${callId}`);

      // Notify caller that call was accepted
      io.to(`user:${callerId}`).emit('call:accepted', {
        callId,
        acceptedBy: socket.user.id,
        acceptedByName: socket.user.name,
      });
    });

    // Reject call
    socket.on('call:reject', ({ callId, callerId, reason }) => {
      console.log(`❌ Call rejected: ${callId} - ${reason || 'declined'}`);

      // Notify caller that call was rejected
      io.to(`user:${callerId}`).emit('call:rejected', {
        callId,
        rejectedBy: socket.user.id,
        rejectedByName: socket.user.name,
        reason: reason || 'declined',
      });
    });

    // End call
    socket.on('call:end', ({ callId, participants }) => {
      console.log(`🔚 Call ended: ${callId}`);

      // Notify all participants
      if (Array.isArray(participants)) {
        participants.forEach(userId => {
          io.to(`user:${userId}`).emit('call:ended', {
            callId,
            endedBy: socket.user.id,
            endedByName: socket.user.name,
          });
        });
      }
    });

    // Call missed (no answer after timeout)
    socket.on('call:missed', ({ callId, targetUserId }) => {
      console.log(`📵 Call missed: ${callId}`);

      io.to(`user:${targetUserId}`).emit('call:missed', {
        callId,
        missedFrom: socket.user.id,
        missedFromName: socket.user.name,
      });
    });

    // User is busy on another call
    socket.on('call:busy', ({ callId, callerId }) => {
      console.log(`📵 User busy: ${socket.user.id}`);

      io.to(`user:${callerId}`).emit('call:busy', {
        callId,
        busyUser: socket.user.id,
        busyUserName: socket.user.name,
      });
    });
  });
};
