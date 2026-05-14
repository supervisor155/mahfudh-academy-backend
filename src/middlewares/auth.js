const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE } = require('../config/env');
const db = require('../db');

module.exports = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Malformed token' });
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
    const currentUser = rows[0];
    if (!currentUser) return res.status(401).json({ message: 'User not found or inactive' });
    if (Number(decoded.sv || 0) !== Number(currentUser.session_version || 0)) {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }

    req.user = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    };
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};
