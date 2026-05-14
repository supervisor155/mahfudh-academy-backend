const db = require('../../db');

exports.create = async ({ class_id, created_by, title, body, pinned }) => {
  const { rows } = await db.query(
    `INSERT INTO announcements (class_id, created_by, title, body, pinned)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [class_id, created_by, title, body, pinned || false]
  );
  return rows[0];
};

exports.getByClass = async (class_id) => {
  const { rows } = await db.query(
    `SELECT a.*, u.name AS author_name
     FROM announcements a
     LEFT JOIN users u ON a.created_by = u.id
     WHERE a.class_id = $1
     ORDER BY a.pinned DESC, a.created_at DESC`,
    [class_id]
  );
  return rows;
};

exports.getById = async (id) => {
  const { rows } = await db.query(`SELECT * FROM announcements WHERE id = $1`, [id]);
  return rows[0];
};

exports.update = async (id, { title, body, pinned }) => {
  const { rows } = await db.query(
    `UPDATE announcements
     SET title = COALESCE($1, title),
         body  = COALESCE($2, body),
         pinned = COALESCE($3, pinned),
         updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [title, body, pinned, id]
  );
  return rows[0];
};

exports.remove = async (id) => {
  await db.query(`DELETE FROM announcements WHERE id = $1`, [id]);
};
