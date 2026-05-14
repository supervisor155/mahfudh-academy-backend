/**
 * Realtime Utility — stores the Socket.io instance globally so any
 * service can push events without circular dependencies.
 *
 * Usage in server.js:
 *   const { setIo } = require('./src/utils/realtime');
 *   setIo(io);
 *
 * Usage in any service/controller:
 *   const { getIo } = require('../../utils/realtime');
 *   getIo()?.to(`user:${id}`).emit('event', payload);
 */

let _io = null;

exports.setIo = (io) => { _io = io; };
exports.getIo = () => _io;
