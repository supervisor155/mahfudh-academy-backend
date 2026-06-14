const socketAuth = require('./socketAuth');
const socketBanAuth = require('./socketBanAuth');
const chatHandler = require('./chat.handler');
const sessionHandler = require('./session.handler');
const notificationsHandler = require('./notifications.handler');
const noteSyncHandler = require('./noteSync.handler');
const mushafHandler = require('./mushaf.handler');
const presenceHandler = require('./presence.handler');
const callingHandler = require('./calling.handler');
const { bandwidthHandler } = require('../utils/bandwidth');
const attachSocketTrafficGuard = require('./trafficGuard');
const db = require('../config/db');

module.exports = (io) => {
  io.use(socketAuth);
  io.use(socketBanAuth);

  chatHandler(io);
  sessionHandler(io);
  notificationsHandler(io);
  noteSyncHandler(io);
  mushafHandler(io);
  presenceHandler(io);
  callingHandler(io);

  io.on('connection', async (socket) => {
    // Always join a stable per-user room for targeted emits (DM, signaling, notifications).
    socket.join(`user:${socket.user.id}`);
    attachSocketTrafficGuard(socket);
    bandwidthHandler(io, socket);

    // Auto-join all class rooms so broadcasts like announcement:new are received
    try {
      const { rows } = await db.query(
        `SELECT c.id FROM classes c
         LEFT JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = $1
         WHERE c.deleted_at IS NULL
           AND (cm.user_id IS NOT NULL OR c.created_by = $1)`,
        [socket.user.id]
      );
      rows.forEach(({ id }) => socket.join(`class:${id}`));
    } catch (_) {
      // Non-fatal: user won't receive class broadcasts this session
    }
  });
};
