/**
 * Storage Utility — Local disk for now, Supabase Storage ready.
 *
 * ── HOW TO MIGRATE TO SUPABASE STORAGE ──────────────────────
 * 1. npm install @supabase/supabase-js
 * 2. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to .env
 * 3. Replace diskStorage with multer.memoryStorage()
 * 4. In the upload controller, call uploadToSupabase(req.file) instead of
 *    relying on multer saving to disk.
 * 5. Update getPublicUrl() to return the Supabase bucket URL.
 * ─────────────────────────────────────────────────────────────
 */

const multer = require('multer');
const path   = require('path');
const crypto = require('crypto');
const fs     = require('fs');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Ensure local uploads folder exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── LOCAL DISK STORAGE ───────────────────────────────────────
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${crypto.randomUUID()}${ext}`;
    cb(null, name);
  },
});

const ALLOWED_MIME = /^(video|audio|image|application\/pdf|application\/msword|application\/vnd\.openxmlformats)/;

exports.upload = multer({
  storage: diskStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

function getRequestBaseUrl(req) {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req?.get?.('host') || req?.headers?.host;
  const proto = forwardedProto || req?.protocol;

  if (!host) return null;
  return `${proto || 'http'}://${host}`;
}

// ── PUBLIC URL ───────────────────────────────────────────────
exports.getPublicUrl = (filename, req) => {
  // TODO (Supabase): return supabase.storage.from('quran-assets').getPublicUrl(filename).data.publicUrl
  const base = getRequestBaseUrl(req) || process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
  return `${String(base).replace(/\/$/, '')}/uploads/${filename}`;
};

// ── DELETE FILE ──────────────────────────────────────────────
exports.deleteFile = (filename) => {
  // TODO (Supabase): return supabase.storage.from('quran-assets').remove([filename])
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.unlink(filepath, () => {}); // silent — file may already be gone
};
