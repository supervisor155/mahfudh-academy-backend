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

  io.on('connection', (socket) => {
    // Always join a stable per-user room for targeted emits (DM, signaling, notifications).
    socket.join(`user:${socket.user.id}`);
    attachSocketTrafficGuard(socket);
    bandwidthHandler(io, socket);
  });
};
