const db = require('../../db');

exports.uploadReel = async ({ class_id, title, url, uploaded_by }) => {
  const { rows } = await db.query(
    `INSERT INTO reels (class_id, title, url, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [class_id, title, url, uploaded_by]
  );
  return rows[0];
};

exports.getReelsByClass = async (class_id, limit = 20, offset = 0) => {
  const { rows } = await db.query(
    `SELECT r.*, u.name as uploader_name,
            (SELECT COUNT(*) FROM reel_likes rl WHERE rl.reel_id = r.id) AS like_count
     FROM reels r JOIN users u ON r.uploaded_by = u.id
     WHERE r.class_id = $1 AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
    [class_id, limit, offset]
  );
  return rows;
};

/**
 * Global feed — returns reels from:
 *   - public classes (is_private = false or NULL)
 *   - private classes where the requesting user is a member
 */
exports.getGlobalFeed = async (user_id, limit = 15, offset = 0) => {
  const { rows } = await db.query(
    `SELECT r.*, u.name AS uploader_name, c.name AS class_name, c.is_private,
            (SELECT COUNT(*) FROM reel_likes rl WHERE rl.reel_id = r.id) AS like_count,
            EXISTS (SELECT 1 FROM reel_likes rl WHERE rl.reel_id = r.id AND rl.user_id = $1) AS liked_by_me
     FROM reels r
     JOIN users u   ON r.uploaded_by = u.id
     JOIN classes c ON r.class_id = c.id
     WHERE r.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND (
         COALESCE(c.is_private, FALSE) = FALSE
         OR EXISTS (
           SELECT 1 FROM class_members cm
           WHERE cm.class_id = r.class_id AND cm.user_id = $1
         )
       )
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [user_id, limit, offset]
  );
  return rows;
};

exports.getReelById = async (reel_id) => {
  const { rows } = await db.query(
    `SELECT r.*, u.name as uploader_name FROM reels r JOIN users u ON r.uploaded_by = u.id WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [reel_id]
  );
  return rows[0];
};

exports.deleteReel = async (reel_id) => {
  // Soft delete — preserves view history
  await db.query('UPDATE reels SET deleted_at = NOW() WHERE id = $1', [reel_id]);
};

exports.trackView = async (reel_id, user_id, timestamp_seconds) => {
  await db.query(
    `INSERT INTO reel_views (reel_id, user_id, timestamp_seconds)
     VALUES ($1, $2, $3)
     ON CONFLICT (reel_id, user_id) DO UPDATE SET viewed_at = NOW(), timestamp_seconds = EXCLUDED.timestamp_seconds`,
    [reel_id, user_id, timestamp_seconds ?? null]
  );
};

exports.getViewCount = async (reel_id) => {
  const { rows } = await db.query(
    'SELECT COUNT(*) as count FROM reel_views WHERE reel_id = $1',
    [reel_id]
  );
  return parseInt(rows[0].count, 10);
};

exports.likeReel = async (reel_id, user_id) => {
  await db.query(
    `INSERT INTO reel_likes (reel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [reel_id, user_id]
  );
  const { rows } = await db.query(
    'SELECT COUNT(*) AS count FROM reel_likes WHERE reel_id = $1',
    [reel_id]
  );
  return parseInt(rows[0].count, 10);
};

exports.unlikeReel = async (reel_id, user_id) => {
  await db.query(
    'DELETE FROM reel_likes WHERE reel_id = $1 AND user_id = $2',
    [reel_id, user_id]
  );
  const { rows } = await db.query(
    'SELECT COUNT(*) AS count FROM reel_likes WHERE reel_id = $1',
    [reel_id]
  );
  return parseInt(rows[0].count, 10);
};

exports.getLikeStatus = async (reel_id, user_id) => {
  const { rows } = await db.query(
    'SELECT 1 FROM reel_likes WHERE reel_id = $1 AND user_id = $2',
    [reel_id, user_id]
  );
  return rows.length > 0;
};
