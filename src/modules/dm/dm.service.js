const db = require('../../db');

exports.getConversation = async (userId, peerId, limit = 100) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { rows } = await db.query(
    `SELECT dm.id, dm.from_user, dm.to_user, dm.message, dm.created_at,
            fu.name AS from_name, fu.role AS from_role
     FROM direct_messages dm
     JOIN users fu ON fu.id = dm.from_user
     WHERE (dm.from_user = $1 AND dm.to_user = $2)
        OR (dm.from_user = $2 AND dm.to_user = $1)
     ORDER BY dm.created_at DESC
     LIMIT $3`,
    [userId, peerId, safeLimit]
  );

  return rows.reverse();
};

exports.createMessage = async (fromUser, toUser, message) => {
  const { rows } = await db.query(
    `INSERT INTO direct_messages (from_user, to_user, message)
     VALUES ($1, $2, $3)
     RETURNING id, from_user, to_user, message, created_at`,
    [fromUser, toUser, message]
  );

  return rows[0];
};

exports.markConversationRead = async (userId, peerId) => {
  await db.query(
    `UPDATE direct_messages
     SET is_read = TRUE
     WHERE to_user = $1 AND from_user = $2 AND is_read = FALSE`,
    [userId, peerId]
  );
};

exports.getRecentConversations = async (userId, limit = 50) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { rows } = await db.query(
    `WITH ranked AS (
      SELECT
        dm.id,
        dm.from_user,
        dm.to_user,
        dm.message,
        dm.created_at,
        CASE WHEN dm.from_user = $1 THEN dm.to_user ELSE dm.from_user END AS peer_id,
        ROW_NUMBER() OVER (
          PARTITION BY LEAST(dm.from_user, dm.to_user), GREATEST(dm.from_user, dm.to_user)
          ORDER BY dm.created_at DESC
        ) AS rn
      FROM direct_messages dm
      WHERE dm.from_user = $1 OR dm.to_user = $1
    )
    SELECT
      r.peer_id,
      r.message,
      r.created_at,
      u.name AS peer_name,
      u.role AS peer_role,
      COALESCE(unread.unread_count, 0) AS unread_count
    FROM ranked r
    JOIN users u ON u.id = r.peer_id
    LEFT JOIN (
      SELECT from_user AS peer_id, COUNT(*)::int AS unread_count
      FROM direct_messages
      WHERE to_user = $1 AND is_read = FALSE
      GROUP BY from_user
    ) unread ON unread.peer_id = r.peer_id
    WHERE r.rn = 1
    ORDER BY r.created_at DESC
    LIMIT $2`,
    [userId, safeLimit]
  );

  return rows;
};
