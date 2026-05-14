const { getActiveSocketBan } = require('../modules/security/security.service');

module.exports = async (socket, next) => {
  try {
    const userId = Number(socket.user?.id) || null;
    const ipAddress = socket.handshake?.address || null;

    const ban = await getActiveSocketBan({ userId, ipAddress });
    if (!ban) return next();

    return next(new Error('Socket access temporarily blocked due to abuse protection'));
  } catch {
    return next();
  }
};
