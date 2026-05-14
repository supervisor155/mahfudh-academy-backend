const db = require('../../db');

// ─── Schema bootstrap ──────────────────────────────────────────────────────

let _ready;
async function ensureSchema() {
  if (_ready) return _ready;
  _ready = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS quran_bookmarks (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ayah_id     VARCHAR(32) NOT NULL,          -- "2:255"
        surah_id    SMALLINT CHECK (surah_id BETWEEN 1 AND 114),
        label       VARCHAR(128),
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, ayah_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON quran_bookmarks(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_bookmarks_surah ON quran_bookmarks(user_id, surah_id)`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS quran_reading_progress (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        surah_id       SMALLINT NOT NULL CHECK (surah_id BETWEEN 1 AND 114),
        last_ayah      SMALLINT NOT NULL DEFAULT 1,
        percent        SMALLINT NOT NULL DEFAULT 0,
        updated_at     TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, surah_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_progress_user ON quran_reading_progress(user_id)`);
  })();
  return _ready;
}

// ─── Bookmarks ────────────────────────────────────────────────────────────

exports.getBookmarks = async (user_id) => {
  await ensureSchema();
  const { rows } = await db.query(
    `SELECT * FROM quran_bookmarks WHERE user_id = $1 ORDER BY created_at DESC`,
    [user_id]
  );
  return rows;
};

exports.addBookmark = async (user_id, ayah_id, label = null) => {
  await ensureSchema();
  const surah_id = parseInt((ayah_id || '').split(':')[0], 10) || null;
  const { rows } = await db.query(
    `INSERT INTO quran_bookmarks (user_id, ayah_id, surah_id, label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, ayah_id) DO UPDATE SET label = EXCLUDED.label
     RETURNING *`,
    [user_id, ayah_id, surah_id, label]
  );
  return rows[0];
};

exports.removeBookmark = async (user_id, ayah_id) => {
  await ensureSchema();
  await db.query(
    `DELETE FROM quran_bookmarks WHERE user_id = $1 AND ayah_id = $2`,
    [user_id, ayah_id]
  );
};

// ─── Reading Progress ─────────────────────────────────────────────────────

exports.getProgress = async (user_id) => {
  await ensureSchema();
  const { rows } = await db.query(
    `SELECT * FROM quran_reading_progress WHERE user_id = $1 ORDER BY surah_id`,
    [user_id]
  );
  return rows;
};

exports.upsertProgress = async (user_id, surah_id, last_ayah, total_ayahs) => {
  await ensureSchema();
  const percent = Math.min(100, Math.round((last_ayah / Math.max(1, total_ayahs)) * 100));
  const { rows } = await db.query(
    `INSERT INTO quran_reading_progress (user_id, surah_id, last_ayah, percent, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, surah_id) DO UPDATE
       SET last_ayah  = GREATEST(quran_reading_progress.last_ayah, EXCLUDED.last_ayah),
           percent    = GREATEST(quran_reading_progress.percent,    EXCLUDED.percent),
           updated_at = NOW()
     RETURNING *`,
    [user_id, surah_id, last_ayah, percent]
  );
  return rows[0];
};
