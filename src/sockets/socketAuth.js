const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE } = require('../config/env');
const db = require('../db');

/**
 * Authenticate a Socket.io connection via JWT passed in handshake auth.
 */
module.exports = async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'],
    });
    const { rows } = await db.query(
      'SELECT id, name, role, session_version FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [decoded.id]
    );
    const current = rows[0];
    if (!current) return next(new Error('User inactive'));
    if (Number(decoded.sv || 0) !== Number(current.session_version || 0)) {
      return next(new Error('Session expired'));
    }
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
};
