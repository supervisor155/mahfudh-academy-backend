const db = require('../../db');
const crypto = require('crypto');

exports.createSession = async ({ class_id, created_by, title, scheduled_start, start_now = true }) => {
  // Metadata for custom signaling (bypassing external SFUs like LiveKit)
  const metadata = {
    room_id: `room-${crypto.randomUUID()}`,
    title: title || null,
    scheduled_start: scheduled_start || null,
    resilience_config: { 
      survival_mode_enabled: true, 
      target_loss: 0.7 
    }
  };

  const startedAtValue = start_now ? 'NOW()' : 'NULL';
  const { rows } = await db.query(
    `INSERT INTO live_sessions (class_id, created_by, metadata, started_at)
     VALUES ($1, $2, $3, ${startedAtValue})
     RETURNING *`,
    [class_id, created_by, JSON.stringify(metadata)]
  );
  return rows[0];
};

exports.endSession = async (session_id) => {
  const { rows } = await db.query(
    `UPDATE live_sessions SET ended_at = NOW() WHERE id = $1 RETURNING *`,
    [session_id]
  );
  return rows[0];
};

exports.getSessionsByClass = async (class_id, limit = 10, offset = 0) => {
  const { rows } = await db.query(
    `SELECT
       ls.*,
       u.name as host_name,
       COALESCE(ls.metadata->>'title', CONCAT('Session #', ls.id::text)) AS title,
       COALESCE(ls.started_at, (ls.metadata->>'scheduled_start')::timestamp, ls.created_at) AS start_time,
       CASE
         WHEN ls.ended_at IS NOT NULL THEN 'ended'
         WHEN ls.started_at IS NOT NULL THEN 'live'
         WHEN (ls.metadata->>'scheduled_start') IS NOT NULL THEN 'upcoming'
         ELSE 'scheduled'
       END AS status,
       (
         SELECT COUNT(*)::int
         FROM live_session_participants lsp
         WHERE lsp.session_id = ls.id AND lsp.left_at IS NULL
       ) AS participant_count
     FROM live_sessions ls
     JOIN users u ON ls.created_by = u.id
     WHERE ls.class_id = $1
     ORDER BY COALESCE(ls.started_at, (ls.metadata->>'scheduled_start')::timestamp, ls.created_at) DESC
     LIMIT $2 OFFSET $3`,
    [class_id, limit, offset]
  );
  return rows;
};

exports.getSessionById = async (session_id) => {
  const { rows } = await db.query(
    `SELECT
       ls.*,
       u.name as host_name,
       COALESCE(ls.metadata->>'title', CONCAT('Session #', ls.id::text)) AS title,
       COALESCE(ls.started_at, (ls.metadata->>'scheduled_start')::timestamp, ls.created_at) AS start_time,
       CASE
         WHEN ls.ended_at IS NOT NULL THEN 'ended'
         WHEN ls.started_at IS NOT NULL THEN 'live'
         WHEN (ls.metadata->>'scheduled_start') IS NOT NULL THEN 'upcoming'
         ELSE 'scheduled'
       END AS status,
       (
         SELECT COUNT(*)::int
         FROM live_session_participants lsp
         WHERE lsp.session_id = ls.id AND lsp.left_at IS NULL
       ) AS participant_count
     FROM live_sessions ls
     JOIN users u ON ls.created_by = u.id
     WHERE ls.id = $1`,
    [session_id]
  );
  return rows[0];
};

exports.joinSession = async (session_id, user_id) => {
  const { rows } = await db.query(
    `INSERT INTO live_session_participants (session_id, user_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`,
    [session_id, user_id]
  );
  return rows[0];
};

exports.leaveSession = async (session_id, user_id) => {
  await db.query(
    `UPDATE live_session_participants SET left_at = NOW()
     WHERE session_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [session_id, user_id]
  );
};

exports.getParticipants = async (session_id) => {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.role, lsp.joined_at, lsp.left_at
     FROM live_session_participants lsp JOIN users u ON lsp.user_id = u.id
     WHERE lsp.session_id = $1 ORDER BY lsp.joined_at ASC`,
    [session_id]
  );
  return rows;
};
