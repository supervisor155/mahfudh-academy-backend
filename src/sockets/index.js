const socketAuth = require('./socketAuth');
const socketBanAuth = require('./socketBanAuth');
const chatHandler = require('./chat.handler');
const sessionHandler = require('./session.handler');
const notificationsHandler = require('./notifications.handler');
const noteSyncHandler = require('./noteSync.handler');
const mushafHandler = require('./mushaf.handler');
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

  io.on('connection', (socket) => {
    attachSocketTrafficGuard(socket);
    bandwidthHandler(io, socket);
  });
};
