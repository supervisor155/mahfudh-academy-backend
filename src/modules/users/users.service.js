const db = require('../../db');

exports.searchUsers = async ({ query, requesterId, limit = 25 }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const q = String(query || '').trim();

  const params = [requesterId, safeLimit];
  let where = 'WHERE u.deleted_at IS NULL AND u.id <> $1';

  if (q) {
    params.splice(1, 0, `%${q}%`);
    where += ' AND (u.name ILIKE $2 OR u.email ILIKE $2)';
  }

  const limitParam = q ? '$3' : '$2';

  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.role
     FROM users u
     ${where}
     ORDER BY u.name ASC
     LIMIT ${limitParam}`,
    params
  );

  return rows;
};
