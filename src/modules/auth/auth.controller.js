const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const {
  getUserByEmail,
  getUserByPhone,
  createUser,
  getUserById,
  bumpUserSessionVersion,
  getUserPasswordHash,
  getLoginGuard,
  recordFailedLogin,
  clearLoginGuard,
  getLoginGuardStats,
  getRecentSecurityEvents,
  getOpenSecurityTickets,
  createRefreshToken,
  getActiveRefreshTokenByHash,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  updateUserRole,
  softDeleteUser,
  getFeaturePermissions,
  upsertFeaturePermissions,
  createWipeBackupSnapshot,
  createWipeRequest,
  getWipeRequestById,
  markWipeRequestCompleted,
  listOwnerActions,
  wipePlatformData,
  createOtpChallenge,
  getLatestActiveOtpChallenge,
  countRecentOtpChallenges,
  incrementOtpAttempt,
  consumeOtpChallenge,
} = require('./auth.service');
const { JWT_SECRET, JWT_EXPIRES_IN, JWT_ISSUER, JWT_AUDIENCE, JWT_REFRESH_AUDIENCE, JWT_REFRESH_EXPIRES_DAYS } = require('../../config/env');
const db = require('../../db');
const auditService = require('../audit/audit.service');
const { issueCsrfToken, parseAuthMode } = require('../../middlewares/csrf');
const { sendOtpEmail, sendOtpSms } = require('../../utils/otpDelivery');
const {
  notifyOwnersSecurityAlert,
  getSocketBanStats,
  createSecurityTicket,
  listSecurityTickets,
  updateSecurityTicketDetails,
} = require('../security/security.service');

const LOGIN_MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES || 6);
const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);
const OTP_EXPIRES_MINUTES = Number(process.env.OTP_EXPIRES_MINUTES || 10);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const OTP_MIN_INTERVAL_SECONDS = Number(process.env.OTP_MIN_INTERVAL_SECONDS || 60);
const REGISTRATION_VERIFICATION_EXPIRES_MINUTES = Number(process.env.REGISTRATION_VERIFICATION_EXPIRES_MINUTES || 15);
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const SELF_REGISTER_ROLES = new Set(['student', 'teacher']);
const OTP_BRUTEFORCE_TICKET_SEVERITY = 'high';

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function normalizePhone(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 16) return null;
  return `+${digits}`;
}

function createOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function signRegistrationVerificationToken({ channel, target }) {
  return jwt.sign(
    { typ: 'otp_verified_register', channel, target },
    JWT_SECRET,
    {
      expiresIn: `${REGISTRATION_VERIFICATION_EXPIRES_MINUTES}m`,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: 'HS256',
    }
  );
}

function verifyRegistrationVerificationToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256'],
  });
}

function getPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone_number: user.phone_number || null,
  };
}

async function escalateOtpBruteforce({ channel, target, attempts, ip, purpose = 'register' }) {
  const details = { channel, target, attempts, ip, purpose };

  await auditService.log({
    actor_id: null,
    action: 'otp_bruteforce_lock',
    target_table: 'otp_challenges',
    target_id: null,
    metadata: details,
  });

  createSecurityTicket({
    actorId: null,
    category: 'otp_bruteforce',
    severity: OTP_BRUTEFORCE_TICKET_SEVERITY,
    title: 'OTP challenge locked after repeated invalid attempts',
    details,
  }).catch(() => null);

  notifyOwnersSecurityAlert({
    message: 'OTP verification challenge was locked due to repeated invalid attempts.',
    payload: details,
    type: 'security_otp_bruteforce',
  }).catch(() => null);
}

function signAuthToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, sv: Number(user.session_version || 0) },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: 'HS256',
    }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
      sv: Number(user.session_version || 0),
      typ: 'refresh',
      jti: crypto.randomBytes(16).toString('hex'),
    },
    JWT_SECRET,
    {
      expiresIn: `${JWT_REFRESH_EXPIRES_DAYS}d`,
      issuer: JWT_ISSUER,
      audience: JWT_REFRESH_AUDIENCE,
      algorithm: 'HS256',
    }
  );
}

async function issueAuthSession(req, user) {
  const access_token = signAuthToken(user);
  const refresh_token = signRefreshToken(user);
  const token_hash = crypto.createHash('sha256').update(refresh_token).digest('hex');
  const expiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await createRefreshToken({
    userId: user.id,
    tokenHash: token_hash,
    expiresAt: expiresAt.toISOString(),
    userAgent: req.headers['user-agent'] || null,
    ipAddress: getClientIp(req),
  });

  return {
    access_token,
    refresh_token,
    token: access_token,
  };
}

// Register a new user
exports.register = async (req, res) => {
  try {
    const { email, password, name, role, phone, registration_verification_token } = req.body;
    if (!password || !name || !role) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (!SELF_REGISTER_ROLES.has(String(role || '').trim().toLowerCase())) {
      return res.status(403).json({ message: 'Manager and owner accounts can only be created by admin actions.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ message: 'Email or phone is required' });
    }

    // Temporary: allow direct registration without OTP verification token.
    // If a token is provided, still validate it to remain compatible.
    if (registration_verification_token) {
      let verified;
      try {
        verified = verifyRegistrationVerificationToken(String(registration_verification_token));
      } catch {
        return res.status(401).json({ message: 'Invalid or expired registration verification token' });
      }

      const expectedTarget = verified.channel === 'phone' ? normalizedPhone : normalizedEmail;
      if (!expectedTarget || verified.target !== expectedTarget) {
        return res.status(401).json({ message: 'Verification token does not match account identifier' });
      }
    }

    const safeEmail = normalizedEmail || `phone-${normalizedPhone.replace(/\D/g, '')}@phone.local`;
    const existing = await getUserByEmail(safeEmail);
    if (existing) return res.status(409).json({ message: 'Email already exists' });
    if (normalizedPhone) {
      const existingByPhone = await getUserByPhone(normalizedPhone);
      if (existingByPhone) return res.status(409).json({ message: 'Phone number already exists' });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await createUser({
      email: safeEmail,
      password_hash: hash,
      name,
      role: String(role).trim().toLowerCase(),
      phone_number: normalizedPhone,
    });
    const tokens = await issueAuthSession(req, user);
    res.status(201).json({
      ...tokens,
      user: getPublicUser(user),
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

exports.requestRegistrationOtp = async (req, res) => {
  try {
    const channel = String(req.body?.channel || '').trim().toLowerCase();
    if (!['email', 'phone'].includes(channel)) {
      return res.status(400).json({ message: 'channel must be email or phone' });
    }

    const target = channel === 'email' ? normalizeEmail(req.body?.email) : normalizePhone(req.body?.phone);
    if (!target) {
      return res.status(400).json({ message: `${channel} is required` });
    }

    const recent = await countRecentOtpChallenges({
      channel,
      target,
      purpose: 'register',
      seconds: OTP_MIN_INTERVAL_SECONDS,
    });

    if (recent > 0) {
      return res.status(429).json({ message: 'Please wait before requesting another code.' });
    }

    const code = createOtpCode();
    const challenge = await createOtpChallenge({
      channel,
      target,
      purpose: 'register',
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000).toISOString(),
      metadata: { ip: getClientIp(req) },
    });

    if (channel === 'email') {
      await sendOtpEmail({ email: target, code });
    } else {
      await sendOtpSms({ phone: target, code });
    }

    await auditService.log({
      actor_id: null,
      action: 'otp_requested',
      target_table: 'otp_challenges',
      target_id: challenge.id,
      metadata: { channel, target },
    });

    return res.json({
      message: `OTP was sent to your ${channel}.`,
      expires_in_seconds: OTP_EXPIRES_MINUTES * 60,
      channel,
      debug_code: String(process.env.OTP_DEV_LOG_CODE || '0') === '1' ? code : undefined,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
};

exports.requestLoginOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ message: 'email is required' });
    }

    const recent = await countRecentOtpChallenges({
      channel: 'email',
      target: email,
      purpose: 'login',
      seconds: OTP_MIN_INTERVAL_SECONDS,
    });

    if (recent > 0) {
      return res.status(429).json({ message: 'Please wait before requesting another code.' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.json({
        message: 'If the email exists, an OTP has been sent.',
        expires_in_seconds: OTP_EXPIRES_MINUTES * 60,
      });
    }

    const code = createOtpCode();
    const challenge = await createOtpChallenge({
      channel: 'email',
      target: email,
      purpose: 'login',
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000).toISOString(),
      metadata: { ip: getClientIp(req) },
    });

    await sendOtpEmail({ email, code });

    await auditService.log({
      actor_id: user.id,
      action: 'otp_requested',
      target_table: 'otp_challenges',
      target_id: challenge.id,
      metadata: { channel: 'email', target: email, purpose: 'login' },
    });

    return res.json({
      message: 'OTP was sent to your email.',
      expires_in_seconds: OTP_EXPIRES_MINUTES * 60,
      debug_code: String(process.env.OTP_DEV_LOG_CODE || '0') === '1' ? code : undefined,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to send login OTP', error: err.message });
  }
};

exports.verifyRegistrationOtp = async (req, res) => {
  try {
    const channel = String(req.body?.channel || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!['email', 'phone'].includes(channel)) {
      return res.status(400).json({ message: 'channel must be email or phone' });
    }
    if (!code) return res.status(400).json({ message: 'code is required' });

    const target = channel === 'email' ? normalizeEmail(req.body?.email) : normalizePhone(req.body?.phone);
    if (!target) {
      return res.status(400).json({ message: `${channel} is required` });
    }

    const challenge = await getLatestActiveOtpChallenge({ channel, target, purpose: 'register' });
    if (!challenge) {
      return res.status(400).json({ message: 'No active OTP challenge found or code expired' });
    }

    if (Number(challenge.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      await consumeOtpChallenge(challenge.id);
      await escalateOtpBruteforce({
        channel,
        target,
        attempts: Number(challenge.attempts || 0),
        ip: getClientIp(req),
      });
      return res.status(429).json({ message: 'OTP challenge locked due to too many failed attempts' });
    }

    const attemptedHash = hashOtp(code);
    const valid = crypto.timingSafeEqual(Buffer.from(attemptedHash), Buffer.from(challenge.code_hash));

    if (!valid) {
      const attemptState = await incrementOtpAttempt(challenge.id);
      if (Number(attemptState?.attempts || 0) >= OTP_MAX_ATTEMPTS) {
        await consumeOtpChallenge(challenge.id);
        await escalateOtpBruteforce({
          channel,
          target,
          attempts: Number(attemptState?.attempts || 0),
          ip: getClientIp(req),
        });
      }
      return res.status(401).json({ message: 'Invalid OTP code' });
    }

    await consumeOtpChallenge(challenge.id);
    const registrationToken = signRegistrationVerificationToken({ channel, target });

    await auditService.log({
      actor_id: null,
      action: 'otp_verified',
      target_table: 'otp_challenges',
      target_id: challenge.id,
      metadata: { channel, target },
    });

    return res.json({
      registration_verification_token: registrationToken,
      expires_in_seconds: REGISTRATION_VERIFICATION_EXPIRES_MINUTES * 60,
    });
  } catch (err) {
    return res.status(500).json({ message: 'OTP verification failed', error: err.message });
  }
};

exports.verifyLoginOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!email) return res.status(400).json({ message: 'email is required' });
    if (!code) return res.status(400).json({ message: 'code is required' });

    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid login OTP or email' });

    const challenge = await getLatestActiveOtpChallenge({ channel: 'email', target: email, purpose: 'login' });
    if (!challenge) {
      return res.status(400).json({ message: 'No active OTP challenge found or code expired' });
    }

    if (Number(challenge.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      await consumeOtpChallenge(challenge.id);
      await escalateOtpBruteforce({
        channel: 'email',
        target: email,
        attempts: Number(challenge.attempts || 0),
        ip: getClientIp(req),
        purpose: 'login',
      });
      return res.status(429).json({ message: 'OTP challenge locked due to too many failed attempts' });
    }

    const attemptedHash = hashOtp(code);
    const validCode = crypto.timingSafeEqual(Buffer.from(attemptedHash), Buffer.from(challenge.code_hash));
    if (!validCode) {
      const attemptState = await incrementOtpAttempt(challenge.id);
      if (Number(attemptState?.attempts || 0) >= OTP_MAX_ATTEMPTS) {
        await consumeOtpChallenge(challenge.id);
        await escalateOtpBruteforce({
          channel: 'email',
          target: email,
          attempts: Number(attemptState?.attempts || 0),
          ip: getClientIp(req),
          purpose: 'login',
        });
      }
      return res.status(401).json({ message: 'Invalid login OTP or email' });
    }

    if (password) {
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ message: 'Invalid optional password' });
      }
    }

    await consumeOtpChallenge(challenge.id);
    await clearLoginGuard({ email, ip: getClientIp(req) });

    const tokens = await issueAuthSession(req, user);
    return res.json({ ...tokens, user: getPublicUser(user) });
  } catch (err) {
    return res.status(500).json({ message: 'Login verification failed', error: err.message });
  }
};

exports.googleAuth = async (req, res) => {
  try {
    const idToken = String(req.body?.id_token || '').trim();
    const requestedRole = String(req.body?.role || 'student').trim().toLowerCase();
    const normalizedPhone = normalizePhone(req.body?.phone);

    if (!idToken) return res.status(400).json({ message: 'id_token is required' });
    if (!SELF_REGISTER_ROLES.has(requestedRole)) {
      return res.status(403).json({ message: 'Manager and owner accounts can only be created by admin actions.' });
    }
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      return res.status(503).json({ message: 'Google sign-in is not configured on the server' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);
    const name = String(payload?.name || 'Google User').trim();
    const emailVerified = !!payload?.email_verified;

    if (!email || !emailVerified) {
      return res.status(401).json({ message: 'Google account email is not verified' });
    }

    let user = await getUserByEmail(email);
    if (!user) {
      if (normalizedPhone) {
        const existingByPhone = await getUserByPhone(normalizedPhone);
        if (existingByPhone) return res.status(409).json({ message: 'Phone number already exists' });
      }

      const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      user = await createUser({
        email,
        password_hash: randomPasswordHash,
        name,
        role: requestedRole,
        phone_number: normalizedPhone,
        google_sub: String(payload?.sub || ''),
      });
    }

    const tokens = await issueAuthSession(req, user);
    return res.json({ ...tokens, user: getPublicUser(user) });
  } catch (err) {
    return res.status(401).json({ message: 'Google authentication failed', error: err.message });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, phone, identifier, password } = req.body;
    const normalizedEmail = normalizeEmail(email || identifier);
    const normalizedPhone = normalizePhone(phone || identifier);
    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ message: 'Email or phone is required' });
    }
    const ip = getClientIp(req);
    const identityForGuard = normalizedEmail || normalizedPhone;

    const guard = await getLoginGuard({ email: identityForGuard, ip });
    if (guard?.lock_until && new Date(guard.lock_until) > new Date()) {
      const retryAfter = Math.max(1, Math.ceil((new Date(guard.lock_until).getTime() - Date.now()) / 1000));
      return res.status(429).json({
        message: 'Account temporarily locked due to repeated failed login attempts',
        retry_after_seconds: retryAfter,
      });
    }

    const user = normalizedEmail ? await getUserByEmail(normalizedEmail) : await getUserByPhone(normalizedPhone);
    if (!user) {
      const state = await recordFailedLogin({
        email: identityForGuard,
        ip,
        maxFailures: LOGIN_MAX_FAILURES,
        lockMinutes: LOGIN_LOCK_MINUTES,
      });
      await auditService.log({
        actor_id: null,
        action: state?.lock_until ? 'login_locked' : 'login_failed',
        target_table: 'users',
        target_id: null,
        metadata: { email: identityForGuard, ip, failed_count: state?.failed_count || 1 },
      });
      if (state?.lock_until) {
        createSecurityTicket({
          actorId: null,
          category: 'login_lockout',
          severity: 'high',
          title: 'Automated lockout for repeated failed login attempts',
          details: { email: identityForGuard, ip, failed_count: state?.failed_count || 1 },
        }).catch(() => null);
        notifyOwnersSecurityAlert({
          message: 'A login identity was temporarily locked after repeated failed attempts.',
          payload: { email: identityForGuard, ip, failed_count: state?.failed_count || 1 },
          type: 'security_login_lock',
        }).catch(() => null);
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const state = await recordFailedLogin({
        email: identityForGuard,
        ip,
        maxFailures: LOGIN_MAX_FAILURES,
        lockMinutes: LOGIN_LOCK_MINUTES,
      });
      await auditService.log({
        actor_id: user.id,
        action: state?.lock_until ? 'login_locked' : 'login_failed',
        target_table: 'users',
        target_id: user.id,
        metadata: { email: identityForGuard, ip, failed_count: state?.failed_count || 1 },
      });
      if (state?.lock_until) {
        createSecurityTicket({
          actorId: user.id,
          category: 'login_lockout',
          severity: 'high',
          title: 'Automated lockout for repeated failed login attempts',
          details: { user_id: user.id, email: identityForGuard, ip, failed_count: state?.failed_count || 1 },
        }).catch(() => null);
        notifyOwnersSecurityAlert({
          message: 'A user account was temporarily locked after repeated failed login attempts.',
          payload: { user_id: user.id, email: identityForGuard, ip, failed_count: state?.failed_count || 1 },
          type: 'security_login_lock',
        }).catch(() => null);
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await clearLoginGuard({ email: identityForGuard, ip });
    const tokens = await issueAuthSession(req, user);
    res.json({ ...tokens, user: getPublicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

exports.refreshSession = async (req, res) => {
  try {
    const refreshToken = String(req.body?.refresh_token || '').trim();
    if (!refreshToken) return res.status(400).json({ message: 'refresh_token is required' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET, {
        issuer: JWT_ISSUER,
        audience: JWT_REFRESH_AUDIENCE,
        algorithms: ['HS256'],
      });
    } catch {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await getActiveRefreshTokenByHash(tokenHash);
    if (!stored) return res.status(401).json({ message: 'Refresh token expired or revoked' });

    const user = await getUserById(decoded.id);
    if (!user || user.deleted_at) return res.status(401).json({ message: 'User not found or inactive' });
    if (Number(decoded.sv || 0) !== Number(user.session_version || 0)) {
      await revokeAllRefreshTokensForUser(user.id);
      return res.status(401).json({ message: 'Session invalidated. Please login again.' });
    }

    const tokens = await issueAuthSession(req, user);
    const newHash = crypto.createHash('sha256').update(tokens.refresh_token).digest('hex');
    const newStored = await getActiveRefreshTokenByHash(newHash);
    await revokeRefreshToken({ tokenHash, replacedBy: newStored?.id || null });

    return res.json({ ...tokens, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const refreshToken = String(req.body?.refresh_token || '').trim();
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await revokeRefreshToken({ tokenHash });
    }
    return res.json({ message: 'Logged out' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getCsrfToken = async (req, res) => {
  try {
    const token = issueCsrfToken(req, res);
    res.json({ csrf_token: token, auth_mode: parseAuthMode() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSecurityStatus = async (req, res) => {
  try {
    const [lockStats, events, socketBanStats, openTickets] = await Promise.all([
      getLoginGuardStats(),
      getRecentSecurityEvents({ hours: 24, limit: 50 }),
      getSocketBanStats(),
      getOpenSecurityTickets({ limit: 12 }),
    ]);

    const secretLooksDefault = !JWT_SECRET || JWT_SECRET === 'supersecret';
    const jwtHours = String(JWT_EXPIRES_IN || '').toLowerCase();
    const tokenLifetimeRisky = jwtHours.includes('d') && !jwtHours.includes('0.5d');

    return res.json({
      data: {
        auth_mode: parseAuthMode(),
        checks: {
          jwt_secret_is_default: secretLooksDefault,
          jwt_issuer_set: !!JWT_ISSUER,
          jwt_audience_set: !!JWT_AUDIENCE,
          token_lifetime_config: JWT_EXPIRES_IN,
          token_lifetime_risky: tokenLifetimeRisky,
        },
        login_guard: lockStats,
        socket_abuse_guard: socketBanStats,
        open_security_tickets: openTickets,
        recent_security_events_24h: events,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getSecurityTickets = async (req, res) => {
  try {
    const { status = 'all', limit = 50, offset = 0 } = req.query;
    const data = await listSecurityTickets({
      status: String(status || 'all'),
      limit: Number(limit),
      offset: Number(offset),
    });
    return res.json({ data, limit: Number(limit), offset: Number(offset), status: String(status || 'all') });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.updateSecurityTicketStatus = async (req, res) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const statusRaw = String(req.body?.status || '').trim().toLowerCase();
    const status = statusRaw || undefined;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : undefined;
    const severityRaw = String(req.body?.severity || '').trim().toLowerCase();
    const severity = severityRaw || undefined;
    const assigneeIdRaw = req.body?.assignee_id;
    const dueAtRaw = req.body?.due_at;
    const tagsRaw = req.body?.tags;

    if (!ticketId) return res.status(400).json({ message: 'Invalid ticket id' });
    if (status && !['open', 'acknowledged', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'status must be one of: open, acknowledged, resolved' });
    }
    if (severity && !['low', 'medium', 'high', 'critical'].includes(severity)) {
      return res.status(400).json({ message: 'severity must be one of: low, medium, high, critical' });
    }

    let assigneeId = undefined;
    if (assigneeIdRaw === null || assigneeIdRaw === '') {
      assigneeId = null;
    } else if (assigneeIdRaw !== undefined) {
      const parsed = Number(assigneeIdRaw);
      if (!parsed) return res.status(400).json({ message: 'assignee_id must be a valid user id or null' });
      assigneeId = parsed;
    }

    let dueAt = undefined;
    if (dueAtRaw === null || dueAtRaw === '') {
      dueAt = null;
    } else if (dueAtRaw !== undefined) {
      const d = new Date(dueAtRaw);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'due_at must be a valid datetime or null' });
      dueAt = d.toISOString();
    }

    let tags = undefined;
    if (tagsRaw !== undefined) {
      if (!Array.isArray(tagsRaw)) {
        return res.status(400).json({ message: 'tags must be an array of strings' });
      }
      tags = tagsRaw
        .map((x) => String(x || '').trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10);
    }

    const updated = await updateSecurityTicketDetails({
      ticketId,
      status,
      ownerId: req.user.id,
      note,
      assigneeId,
      dueAt,
      severity,
      tags,
    });

    if (!updated) return res.status(404).json({ message: 'Security ticket not found' });

    await auditService.log({
      actor_id: req.user.id,
      action: 'security_ticket_update',
      target_table: 'security_tickets',
      target_id: ticketId,
      metadata: {
        status: status || null,
        note: note ?? null,
        assignee_id: assigneeId === undefined ? null : assigneeId,
        due_at: dueAt === undefined ? null : dueAt,
        severity: severity || null,
        tags: tags || null,
      },
    });

    return res.json({ data: updated, message: 'Ticket updated' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// List users — manager & owner only
exports.listUsers = async (req, res) => {
  try {
    const { role, limit = 100, offset = 0, search } = req.query;
    const params = [];
    let where = 'WHERE deleted_at IS NULL';
    if (role) {
      params.push(role);
      where += ` AND role = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where += ` AND (name ILIKE $${idx} OR email ILIKE $${idx})`;
    }
    const countParams = [...params];
    params.push(Number(limit), Number(offset));
    const { rows } = await db.query(
      `SELECT id, name, email, role, created_at FROM users ${where}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as total FROM users ${where}`,
      countParams
    );
    res.json({ data: rows, total: parseInt(countRows[0]?.total || 0, 10) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get platform-wide stats — manager & owner only
exports.getPlatformStats = async (req, res) => {
  try {
    const [classCount, userCounts, sessionCount] = await Promise.all([
      db.query(`SELECT COUNT(*) as total FROM classes WHERE deleted_at IS NULL`),
      db.query(`SELECT role, COUNT(*) as total FROM users WHERE deleted_at IS NULL GROUP BY role`),
      db.query(`SELECT COUNT(*) as total FROM live_sessions WHERE ended_at IS NULL`),
    ]);
    const byRole = {};
    userCounts.rows.forEach((r) => { byRole[r.role] = parseInt(r.total, 10); });
    res.json({
      classes: parseInt(classCount.rows[0]?.total || 0, 10),
      teachers: byRole.teacher || 0,
      students: byRole.student || 0,
      managers: byRole.manager || 0,
      activeSessions: parseInt(sessionCount.rows[0]?.total || 0, 10),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const VALID_ROLES = new Set(['owner', 'manager', 'teacher', 'student']);
const FEATURE_CATALOG = [
  {
    feature_key: 'manage_classes',
    label: 'Manage Classes',
    description: 'Allow class lifecycle management, member management, and access request decisions.',
    route_impacts: [
      'POST /api/classes',
      'PATCH /api/classes/:id',
      'DELETE /api/classes/:id',
      'POST /api/classes/:id/members',
      'POST /api/classes/:id/access-requests/:requestId/approve',
    ],
  },
  {
    feature_key: 'manage_users',
    label: 'Manage Users',
    description: 'Allow listing and user-registry access for administrative views.',
    route_impacts: [
      'GET /api/auth/users',
    ],
  },
  {
    feature_key: 'view_audit_logs',
    label: 'View Audit Logs',
    description: 'Allow access to system audit stream for oversight.',
    route_impacts: [
      'GET /api/audit',
    ],
  },
  {
    feature_key: 'manage_content',
    label: 'Manage Content',
    description: 'Allow creation/update/deletion workflows for videos, reels, attachments, announcements, and assignments.',
    route_impacts: [
      'POST /api/videos',
      'POST /api/reels',
      'POST /api/attachments',
      'POST /api/announcements',
      'POST /api/assignments',
    ],
  },
  {
    feature_key: 'manage_live_sessions',
    label: 'Manage Live Sessions',
    description: 'Allow starting, ending, and supervising live-session operations.',
    route_impacts: [
      'POST /api/sessions',
      'PATCH /api/sessions/:id/end',
      'GET /api/sessions/:id/participants',
    ],
  },
  {
    feature_key: 'moderate_chat',
    label: 'Moderate Chat',
    description: 'Reserved for chat moderation controls and escalation tooling.',
    route_impacts: [
      'Reserved for upcoming moderation endpoints',
    ],
  },
  {
    feature_key: 'platform_settings',
    label: 'Platform Settings',
    description: 'Allow platform-level operational settings and stats access.',
    route_impacts: [
      'GET /api/auth/stats',
    ],
  },
];

const FEATURE_KEYS = new Set(FEATURE_CATALOG.map((x) => x.feature_key));

async function requireOwnerPassword(req, res) {
  const ownerPassword = String(req.body?.owner_password || '');
  if (!ownerPassword) {
    res.status(400).json({ message: 'owner_password is required' });
    return null;
  }

  const ownerSecret = await getUserPasswordHash(req.user.id);
  if (!ownerSecret) {
    res.status(401).json({ message: 'Owner account not found' });
    return null;
  }

  const valid = await bcrypt.compare(ownerPassword, ownerSecret.password_hash);
  if (!valid) {
    res.status(401).json({ message: 'Owner password confirmation failed' });
    return null;
  }

  return true;
}

function requireActionReason(req, res) {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 8) {
    res.status(400).json({ message: 'reason must be at least 8 characters' });
    return null;
  }
  return reason;
}

exports.updateUserRole = async (req, res) => {
  try {
    const stepUp = await requireOwnerPassword(req, res);
    if (!stepUp) return;
    const reason = requireActionReason(req, res);
    if (!reason) return;

    const userId = Number(req.params.userId);
    const role = String(req.body?.role || '').trim();

    if (!userId || !VALID_ROLES.has(role)) {
      return res.status(400).json({ message: 'Invalid user id or role' });
    }

    const target = await getUserById(userId);
    if (!target || target.deleted_at) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (target.id === req.user.id && role !== 'owner') {
      return res.status(400).json({ message: 'Owner cannot demote self' });
    }

    const updated = await updateUserRole(userId, role);
    await bumpUserSessionVersion(userId);
    await revokeAllRefreshTokensForUser(userId);
    await auditService.log({
      actor_id: req.user.id,
      action: 'role_change',
      target_table: 'users',
      target_id: userId,
      metadata: { previous_role: target.role, new_role: role, reason },
    });

    return res.json({ data: updated });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const stepUp = await requireOwnerPassword(req, res);
    if (!stepUp) return;
    const reason = requireActionReason(req, res);
    if (!reason) return;

    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'Invalid user id' });
    if (userId === req.user.id) return res.status(400).json({ message: 'Owner cannot delete self' });

    const target = await getUserById(userId);
    if (!target || target.deleted_at) {
      return res.status(404).json({ message: 'User not found' });
    }

    const deleted = await softDeleteUser(userId);
    await bumpUserSessionVersion(userId);
    await revokeAllRefreshTokensForUser(userId);
    await auditService.log({
      actor_id: req.user.id,
      action: 'delete',
      target_table: 'users',
      target_id: userId,
      metadata: { deleted_email: target.email, role: target.role, reason },
    });

    return res.json({ data: deleted, message: 'User removed' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getUserFeatures = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'Invalid user id' });

    const target = await getUserById(userId);
    if (!target || target.deleted_at) {
      return res.status(404).json({ message: 'User not found' });
    }

    const permissions = await getFeaturePermissions(userId);
    return res.json({ data: permissions });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.updateUserFeatures = async (req, res) => {
  try {
    const stepUp = await requireOwnerPassword(req, res);
    if (!stepUp) return;
    const reason = requireActionReason(req, res);
    if (!reason) return;

    const userId = Number(req.params.userId);
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];

    if (!userId) return res.status(400).json({ message: 'Invalid user id' });
    if (!permissions.length) return res.status(400).json({ message: 'permissions[] is required' });

    const target = await getUserById(userId);
    if (!target || target.deleted_at) {
      return res.status(404).json({ message: 'User not found' });
    }

    const normalized = [];
    for (const p of permissions) {
      const key = String(p?.feature_key || '').trim();
      if (!FEATURE_KEYS.has(key)) {
        return res.status(400).json({ message: `Invalid feature key: ${key}` });
      }
      normalized.push({ feature_key: key, can_access: !!p?.can_access });
    }

    const updated = await upsertFeaturePermissions(userId, normalized, req.user.id);
    await auditService.log({
      actor_id: req.user.id,
      action: 'permissions_update',
      target_table: 'users',
      target_id: userId,
      metadata: { permissions: normalized, reason },
    });

    return res.json({ data: updated });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.listFeatureCatalog = async (_req, res) => {
  return res.json({
    data: FEATURE_CATALOG,
  });
};

exports.prepareWipePlatform = async (req, res) => {
  try {
    const stepUp = await requireOwnerPassword(req, res);
    if (!stepUp) return;
    const reason = requireActionReason(req, res);
    if (!reason) return;

    const confirmText = String(req.body?.confirm_text || '');
    if (confirmText !== 'PREPARE WIPE') {
      return res.status(400).json({
        message: 'Confirmation text mismatch. Send confirm_text = "PREPARE WIPE"',
      });
    }

    const backup = await createWipeBackupSnapshot({ ownerId: req.user.id, reason });
    const wipeToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(wipeToken).digest('hex');

    const executeAfter = new Date(Date.now() + 30 * 1000);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const request = await createWipeRequest({
      ownerId: req.user.id,
      tokenHash,
      reason,
      backupId: backup.id,
      executeAfter,
      expiresAt,
    });

    await auditService.log({
      actor_id: req.user.id,
      action: 'platform_wipe_prepare',
      target_table: 'system',
      target_id: request.id,
      metadata: {
        reason,
        backup_id: backup.id,
        execute_after: request.execute_after,
        expires_at: request.expires_at,
      },
    });

    return res.json({
      data: {
        request_id: request.id,
        wipe_token: wipeToken,
        execute_after: request.execute_after,
        expires_at: request.expires_at,
        backup_snapshot: backup.snapshot,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.wipePlatform = async (req, res) => {
  try {
    const stepUp = await requireOwnerPassword(req, res);
    if (!stepUp) return;

    const requestId = Number(req.body?.request_id);
    const wipeToken = String(req.body?.wipe_token || '').trim();
    const confirmText = String(req.body?.confirm_text || '');
    const secondConfirm = String(req.body?.second_confirm || '');
    const keepOtherOwners = req.body?.keep_other_owners !== false;

    if (!requestId || !wipeToken) {
      return res.status(400).json({ message: 'request_id and wipe_token are required' });
    }

    if (confirmText !== 'WIPE PLATFORM' || secondConfirm !== 'FINAL CONFIRM') {
      return res.status(400).json({
        message: 'Provide confirm_text = "WIPE PLATFORM" and second_confirm = "FINAL CONFIRM"',
      });
    }

    const request = await getWipeRequestById(requestId, req.user.id);
    if (!request || request.status !== 'pending') {
      return res.status(404).json({ message: 'Wipe request not found or already used' });
    }

    if (new Date(request.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Wipe token expired. Prepare again.' });
    }

    if (new Date(request.execute_after).getTime() > Date.now()) {
      return res.status(400).json({ message: 'Cooldown not finished yet. Wait before executing wipe.' });
    }

    const incomingHash = crypto.createHash('sha256').update(wipeToken).digest('hex');
    if (incomingHash !== request.token_hash) {
      return res.status(401).json({ message: 'Invalid wipe token' });
    }

    await wipePlatformData({ ownerId: req.user.id, keepOtherOwners });
    await markWipeRequestCompleted(request.id);
    await auditService.log({
      actor_id: req.user.id,
      action: 'platform_wipe',
      target_table: 'system',
      target_id: null,
      metadata: {
        keep_other_owners: keepOtherOwners,
        reason: request.reason,
        wipe_request_id: request.id,
      },
    });

    return res.json({ message: 'Platform data wiped successfully' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getOwnerActions = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const data = await listOwnerActions({ limit: Number(limit), offset: Number(offset) });
    return res.json({ data, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.exportOwnerActionsCsv = async (_req, res) => {
  try {
    const data = await listOwnerActions({ limit: 1000, offset: 0 });
    const headers = ['id', 'created_at', 'actor_name', 'actor_email', 'action', 'target_table', 'target_id', 'metadata'];

    const escaped = (value) => {
      const raw = value == null ? '' : String(value);
      const safe = raw.replace(/"/g, '""');
      return `"${safe}"`;
    };

    const csvRows = [headers.map(escaped).join(',')];
    data.forEach((row) => {
      csvRows.push([
        row.id,
        row.created_at,
        row.actor_name,
        row.actor_email,
        row.action,
        row.target_table,
        row.target_id,
        JSON.stringify(row.metadata || {}),
      ].map(escaped).join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="owner-actions.csv"');
    return res.status(200).send(csvRows.join('\n'));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
