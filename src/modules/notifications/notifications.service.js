const db        = require('../../db');
const { getIo } = require('../../utils/realtime');

/**
 * Create a notification, persist it to DB, and push real-time if user is online.
 */
exports.createNotification = async ({ user_id, type, message, payload = {} }) => {
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, type, message, payload)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [user_id, type, message, JSON.stringify(payload)]
  );
  const notification = rows[0];

  // Real-time push — non-blocking, works only if user is connected
  getIo()?.to(`user:${user_id}`).emit('notification:new', {
    id:         notification.id,
    type:       notification.type,
    message:    notification.message,
    payload:    notification.payload,
    created_at: notification.created_at,
  });

  return notification;
};

exports.getNotifications = async (user_id, limit = 20, offset = 0) => {
  const { rows } = await db.query(
    `SELECT * FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [user_id, limit, offset]
  );
  return rows;
};

exports.getUnreadCount = async (user_id) => {
  const { rows } = await db.query(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [user_id]
  );
  return parseInt(rows[0].count, 10);
};

exports.markRead = async (notification_id, user_id) => {
  const { rows } = await db.query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
    [notification_id, user_id]
  );
  return rows[0];
};

exports.markAllRead = async (user_id) => {
  await db.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1`, [user_id]);
};
