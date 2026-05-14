const crypto = require('crypto');

function parseAuthMode() {
  return String(process.env.AUTH_MODE || 'bearer').trim().toLowerCase();
}

function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(24).toString('hex');
  const secure = process.env.NODE_ENV === 'production';

  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure,
    sameSite: secure ? 'strict' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  return token;
}

function csrfProtection(req, res, next) {
  const mode = parseAuthMode();
  if (mode !== 'cookie') return next();

  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'CSRF validation failed' });
  }

  return next();
}

module.exports = {
  csrfProtection,
  issueCsrfToken,
  parseAuthMode,
};
