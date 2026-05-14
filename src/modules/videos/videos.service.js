const db = require('../../db');

exports.uploadVideo = async ({ class_id, title, url, uploaded_by }) => {
  const { rows } = await db.query(
    `INSERT INTO videos (class_id, title, url, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [class_id, title, url, uploaded_by]
  );
  return rows[0];
};

exports.getVideosByClass = async (class_id, limit = 20, offset = 0) => {
  const { rows } = await db.query(
    `SELECT v.*, u.name as uploader_name
     FROM videos v JOIN users u ON v.uploaded_by = u.id
     WHERE v.class_id = $1 AND v.deleted_at IS NULL ORDER BY v.created_at DESC LIMIT $2 OFFSET $3`,
    [class_id, limit, offset]
  );
  return rows;
};

exports.getVideoById = async (video_id) => {
  const { rows } = await db.query(
    `SELECT v.*, u.name as uploader_name FROM videos v JOIN users u ON v.uploaded_by = u.id WHERE v.id = $1 AND v.deleted_at IS NULL`,
    [video_id]
  );
  return rows[0];
};

exports.deleteVideo = async (video_id) => {
  // Soft delete — preserves view history
  await db.query('UPDATE videos SET deleted_at = NOW() WHERE id = $1', [video_id]);
};

exports.trackView = async (video_id, user_id) => {
  await db.query(
    `INSERT INTO video_views (video_id, user_id) VALUES ($1, $2)
     ON CONFLICT (video_id, user_id) DO UPDATE SET viewed_at = NOW()`,
    [video_id, user_id]
  );
};

exports.getViewCount = async (video_id) => {
  const { rows } = await db.query(
    'SELECT COUNT(*) as count FROM video_views WHERE video_id = $1',
    [video_id]
  );
  return parseInt(rows[0].count, 10);
};

exports.updateProgress = async (video_id, user_id, progress_percentage) => {
  const pct          = Math.min(Math.max(Number(progress_percentage), 0), 100);
  const is_completed = pct >= 100;
  await db.query(
    `INSERT INTO video_views (video_id, user_id, progress_percentage, is_completed)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (video_id, user_id) DO UPDATE
       SET viewed_at           = NOW(),
           progress_percentage = GREATEST(video_views.progress_percentage, EXCLUDED.progress_percentage),
           is_completed        = EXCLUDED.is_completed`,
    [video_id, user_id, pct, is_completed]
  );
  return { progress_percentage: pct, is_completed };
};
