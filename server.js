require('dotenv').config();
const express          = require('express');
const cors             = require('cors');
const compression      = require('compression');
const helmet           = require('helmet');
const rateLimit        = require('express-rate-limit');
const cookieParser     = require('cookie-parser');
const http             = require('http');
const path             = require('path');
const { Server }       = require('socket.io');
const msgpackParser    = require('socket.io-msgpack-parser');
const { setIo }        = require('./src/utils/realtime');
const { logger, httpLogger } = require('./src/utils/logger');
const db               = require('./src/db');
const auditService     = require('./src/modules/audit/audit.service');
const { csrfProtection } = require('./src/middlewares/csrf');
const { notifyOwnersSecurityAlert, startSecurityMaintenanceJob, createSecurityTicket } = require('./src/modules/security/security.service');
const runMigrations    = require('./src/db/migrate');

const authRoutes         = require('./src/modules/auth/auth.routes');
const classesRoutes      = require('./src/modules/classes/classes.routes');
const videosRoutes       = require('./src/modules/videos/videos.routes');
const reelsRoutes        = require('./src/modules/reels/reels.routes');
const liveSessionsRoutes = require('./src/modules/liveSessions/liveSessions.routes');
const notesRoutes        = require('./src/modules/notes/notes.routes');
const notificationsRoutes = require('./src/modules/notifications/notifications.routes');
const curriculumRoutes   = require('./src/modules/curriculum/curriculum.routes');
const attachmentsRoutes  = require('./src/modules/attachments/attachments.routes');
const auditRoutes        = require('./src/modules/audit/audit.routes');
const quranRoutes        = require('./src/modules/quran/quran.routes');
const mushafRoutes       = require('./src/modules/mushaf/mushaf.routes');
const assignmentsRoutes  = require('./src/modules/assignments/assignments.routes');
const announcementsRoutes = require('./src/modules/announcements/announcements.routes');
const usersRoutes        = require('./src/modules/users/users.routes');
const dmRoutes           = require('./src/modules/dm/dm.routes');

const activityRoutes     = require('./src/modules/activity/activity.routes');
const registerSockets    = require('./src/sockets');

const app    = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const BOOTED_AT = Date.now();
const recent5xx = [];
let last5xxAlertAt = 0;

const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'];
const allowedOriginSet = new Set(allowedOrigins);

function isOriginAllowed(origin) {
  if (!origin) return true;
  return allowedOriginSet.has(origin);
}

// Socket.io with MessagePack binary parser
const io = new Server(server, {
  parser: msgpackParser,
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000,
    skipMiddlewares: true,
  },
  pingInterval: 25000,
  pingTimeout: 30000,
});

// Make io globally accessible in services
setIo(io);

// CORS middleware
const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again shortly.' },
  handler: (req, res) => {
    auditService.log({
      actor_id: req.user?.id || null,
      action: 'rate_limit_hit',
      target_table: 'http',
      target_id: null,
      metadata: { scope: 'api', path: req.originalUrl, method: req.method, ip: getRequestIp(req) },
    });
    res.status(429).json({ message: 'Too many requests. Please try again shortly.' });
  },
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Try again later.' },
  handler: (req, res) => {
    auditService.log({
      actor_id: null,
      action: 'rate_limit_hit',
      target_table: 'auth',
      target_id: null,
      metadata: { scope: 'auth_login', path: req.originalUrl, method: req.method, ip: getRequestIp(req) },
    });
    res.status(429).json({ message: 'Too many login attempts. Try again later.' });
  },
});

const ownerDangerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sensitive actions. Try again later.' },
  handler: (req, res) => {
    auditService.log({
      actor_id: req.user?.id || null,
      action: 'rate_limit_hit',
      target_table: 'owner_actions',
      target_id: null,
      metadata: { scope: 'danger_zone', path: req.originalUrl, method: req.method, ip: getRequestIp(req) },
    });
    createSecurityTicket({
      actorId: req.user?.id || null,
      category: 'danger_zone_rate_limit',
      severity: 'high',
      title: 'Owner danger-zone rate limit threshold reached',
      details: {
        path: req.originalUrl,
        method: req.method,
        ip: getRequestIp(req),
        actor_id: req.user?.id || null,
      },
    }).catch(() => null);
    notifyOwnersSecurityAlert({
      message: 'Owner danger-zone endpoint hit rate limit threshold.',
      payload: {
        path: req.originalUrl,
        method: req.method,
        ip: getRequestIp(req),
        actor_id: req.user?.id || null,
      },
      type: 'security_owner_rate_limit',
    }).catch(() => null);
    res.status(429).json({ message: 'Too many sensitive actions. Try again later.' });
  },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/login/request-otp', loginLimiter);
app.use('/api/auth/login/verify-otp', loginLimiter);
app.use('/api/auth/register', loginLimiter);
app.use('/api/auth/register/request-otp', loginLimiter);
app.use('/api/auth/register/verify-otp', loginLimiter);
app.use('/api/auth/google', loginLimiter);
app.use('/api/auth/system/wipe', ownerDangerLimiter);
app.use('/api/auth/system/wipe/prepare', ownerDangerLimiter);
app.use('/api/auth/users/:userId/role', ownerDangerLimiter);
app.use('/api/auth/users/:userId', ownerDangerLimiter);

app.use(compression({
  threshold: 1024,
  level: 6,
}));
app.use(httpLogger);
app.use(cookieParser());
app.use(express.json({ limit: '512kb' }));
app.use(csrfProtection);

app.get('/health', async (_req, res) => {
  const uptime_s = Math.floor((Date.now() - BOOTED_AT) / 1000);
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'ok', uptime_s, db: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return res.status(503).json({ status: 'degraded', uptime_s, db: 'down', timestamp: new Date().toISOString() });
  }
});

app.get('/ready', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ ready: true, timestamp: new Date().toISOString() });
  } catch {
    return res.status(503).json({ ready: false, timestamp: new Date().toISOString() });
  }
});

// Serve uploaded files locally (swap for Supabase Storage CDN URL when migrating)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  etag: true,
  maxAge: '1d',
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

// API Routes
app.use('/api/auth',          authRoutes);
app.use('/api/classes',       classesRoutes);
app.use('/api/videos',        videosRoutes);
app.use('/api/reels',         reelsRoutes);
app.use('/api/sessions',      liveSessionsRoutes);
app.use('/api/notes',         notesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activity',      activityRoutes);
app.use('/api/curriculum',    curriculumRoutes);
app.use('/api/attachments',   attachmentsRoutes);
app.use('/api/audit',         auditRoutes);
app.use('/api/quran',         quranRoutes);
app.use('/api/mushaf',        mushafRoutes);
app.use('/api/assignments',   assignmentsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/dm',            dmRoutes);

app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 500) return;

    const now = Date.now();
    recent5xx.push(now);
    while (recent5xx.length && now - recent5xx[0] > 5 * 60 * 1000) {
      recent5xx.shift();
    }

    if (recent5xx.length >= 25 && now - last5xxAlertAt > 5 * 60 * 1000) {
      last5xxAlertAt = now;

      auditService.log({
        actor_id: null,
        action: 'server_5xx_spike',
        target_table: 'http',
        target_id: null,
        metadata: {
          count_5xx_5m: recent5xx.length,
          path: req.originalUrl,
          method: req.method,
        },
      });

      createSecurityTicket({
        actorId: null,
        category: 'server_5xx_spike',
        severity: 'critical',
        title: '5xx spike detected on backend',
        details: {
          count_5xx_5m: recent5xx.length,
          path: req.originalUrl,
          method: req.method,
        },
      }).catch(() => null);

      notifyOwnersSecurityAlert({
        message: `5xx spike detected (${recent5xx.length} errors in 5 minutes).`,
        payload: {
          count_5xx_5m: recent5xx.length,
          path: req.originalUrl,
          method: req.method,
        },
        type: 'server_5xx_spike',
      }).catch(() => null);
    }
  });
  next();
});

// Socket.io handlers
registerSockets(io);

// Global error handler
app.use((err, req, res, _next) => {
  if (req.log) {
    req.log.error({ err }, 'Unhandled request error');
  } else {
    logger.error({ err }, 'Unhandled request error');
  }
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

runMigrations()
  .then(() => {
    startSecurityMaintenanceJob();
    server.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server running');
    });
  })
  .catch((err) => {
    logger.fatal({ err }, 'Migration failed');
    process.exit(1);
  });
