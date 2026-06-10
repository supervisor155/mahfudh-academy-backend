/**
 * Storage Utility — Supabase Storage for production, local disk fallback for dev.
 *
 * Production (Render/Vercel): Uses Supabase Storage for persistent file storage
 * Development (Local): Uses local disk storage
 */

const multer = require('multer');
const path   = require('path');
const crypto = require('crypto');
const fs     = require('fs');
const { createClient } = require('@supabase/supabase-js');

const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'mahfudh-uploads';

let supabase = null;
if (USE_SUPABASE) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
      auth: { persistSession: false }
    }
  );
  console.log('✅ Supabase Storage initialized');
}

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Ensure local uploads folder exists (for dev mode)
if (!USE_SUPABASE && !fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── STORAGE CONFIGURATION ────────────────────────────────────
// Use memory storage for Supabase (we'll upload in controller)
// Use disk storage for local development
const storage = USE_SUPABASE
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename:    (_req, file, cb) => {
        const ext  = path.extname(file.originalname).toLowerCase();
        const name = `${crypto.randomUUID()}${ext}`;
        cb(null, name);
      },
    });

const ALLOWED_MIME = /^(video|audio|image|application\/pdf|application\/msword|application\/vnd\.openxmlformats)/;

exports.upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

// ── UPLOAD TO SUPABASE ───────────────────────────────────────
exports.uploadToSupabase = async (file) => {
  if (!USE_SUPABASE) throw new Error('Supabase not configured');

  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${crypto.randomUUID()}${ext}`;
  const filepath = `uploads/${filename}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filepath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    console.error('❌ Supabase upload error:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }

  console.log('✅ Uploaded to Supabase:', filepath);
  return filename;
};

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
  if (USE_SUPABASE && supabase) {
    const { data } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(`uploads/${filename}`);
    return data.publicUrl;
  }

  // Fallback: local disk URL
  const base = getRequestBaseUrl(req) || process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
  return `${String(base).replace(/\/$/, '')}/uploads/${filename}`;
};

// ── DELETE FILE ──────────────────────────────────────────────
exports.deleteFile = async (filename) => {
  if (USE_SUPABASE && supabase) {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([`uploads/${filename}`]);
    if (error) console.error('❌ Supabase delete error:', error);
    return;
  }

  // Fallback: delete from local disk
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.unlink(filepath, () => {}); // silent — file may already be gone
};

exports.USE_SUPABASE = USE_SUPABASE;
