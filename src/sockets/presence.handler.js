/**
 * USER PRESENCE HANDLER
 * Tracks online/offline status and broadcasts to all connected clients
 */

const { logger } = require('../utils/logger');

// In-memory store: user_id -> { socket_id, user_info, last_seen }
const onlineUsers = new Map();

// Class presence: class_id -> Set<user_id>
const classPresence = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const userName = socket.user.name;
    const userRole = socket.user.role;

    // Mark user as online
    onlineUsers.set(userId, {
      socket_id: socket.id,
      user_id: userId,
      name: userName,
      role: userRole,
      connected_at: new Date().toISOString(),
    });

    // Broadcast to all: this user is online
    io.emit('user:online', {
      user_id: userId,
      name: userName,
      role: userRole,
    });

    logger.info({ userId, userName }, '👤 User came online');

    // Send current online users to the newly connected user
    const onlineList = Array.from(onlineUsers.values()).map(u => ({
      user_id: u.user_id,
      name: u.name,
      role: u.role,
    }));
    socket.emit('presence:online-users', { users: onlineList });

    // Join class presence room
    socket.on('presence:join-class', ({ class_id }) => {
      if (!class_id) return;

      socket.join(`class:${class_id}:presence`);

      if (!classPresence.has(class_id)) {
        classPresence.set(class_id, new Set());
      }
      classPresence.get(class_id).add(userId);

      // Broadcast to class: user joined
      io.to(`class:${class_id}:presence`).emit('class:user-online', {
        class_id,
        user_id: userId,
        name: userName,
        role: userRole,
      });

      // Send class members list
      const classMembers = Array.from(classPresence.get(class_id) || [])
        .map(uid => onlineUsers.get(uid))
        .filter(Boolean);

      socket.emit('class:online-members', {
        class_id,
        members: classMembers,
      });
    });

    // Leave class presence room
    socket.on('presence:leave-class', ({ class_id }) => {
      if (!class_id) return;
      socket.leave(`class:${class_id}:presence`);

      const classSet = classPresence.get(class_id);
      if (classSet) {
        classSet.delete(userId);
        if (classSet.size === 0) {
          classPresence.delete(class_id);
        }
      }

      io.to(`class:${class_id}:presence`).emit('class:user-offline', {
        class_id,
        user_id: userId,
      });
    });

    // Typing indicator
    socket.on('presence:typing', ({ class_id, chat_type }) => {
      if (!class_id) return;
      socket.to(`class:${class_id}`).emit('user:typing', {
        user_id: userId,
        name: userName,
        class_id,
        chat_type,
      });
    });

    socket.on('presence:stop-typing', ({ class_id, chat_type }) => {
      if (!class_id) return;
      socket.to(`class:${class_id}`).emit('user:stop-typing', {
        user_id: userId,
        class_id,
        chat_type,
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);

      // Remove from all class presence
      classPresence.forEach((userSet, classId) => {
        if (userSet.has(userId)) {
          userSet.delete(userId);
          io.to(`class:${classId}:presence`).emit('class:user-offline', {
            class_id: classId,
            user_id: userId,
          });
        }
      });

      // Broadcast: user went offline
      io.emit('user:offline', {
        user_id: userId,
        last_seen: new Date().toISOString(),
      });

      logger.info({ userId, userName }, '👤 User went offline');
    });
  });
};

// Export helper to get online users
module.exports.getOnlineUsers = () => {
  return Array.from(onlineUsers.values());
};

module.exports.isUserOnline = (userId) => {
  return onlineUsers.has(userId);
};

module.exports.getClassOnlineUsers = (classId) => {
  const userIds = classPresence.get(classId);
  if (!userIds) return [];
  return Array.from(userIds)
    .map(uid => onlineUsers.get(uid))
    .filter(Boolean);
};
