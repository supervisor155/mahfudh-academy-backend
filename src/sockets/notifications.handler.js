/**
 * NOTIFICATIONS SOCKET HANDLER
 * Room: `user:{user_id}`
 *
 * Each authenticated user auto-joins their private room on connection.
 * Real-time pushes are fired from notifications.service.js via getIo().
 *
 * Events emitted by server:
 *   notification:new { id, type, message, payload, created_at }
 */

module.exports = (io) => {
  io.on('connection', (socket) => {
    // Auto-join the user's private notification room
    socket.join(`user:${socket.user.id}`);
  });
};
