const db = require('../../db');

exports.createAttachment = async ({ class_id, uploaded_by, filename, url, mime_type, size_bytes }) => {
  const { rows } = await db.query(
    `INSERT INTO attachments (class_id, uploaded_by, filename, url, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [class_id, uploaded_by, filename, url, mime_type, size_bytes]
  );
  return rows[0];
};

exports.getAttachmentsByClass = async (class_id, limit = 20, offset = 0) => {
  const { rows } = await db.query(
    `SELECT a.*, u.name AS uploader_name
     FROM attachments a JOIN users u ON a.uploaded_by = u.id
     WHERE a.class_id = $1 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,
    [class_id, limit, offset]
  );
  return rows;
};

exports.getAttachmentById = async (id) => {
  const { rows } = await db.query(`SELECT * FROM attachments WHERE id = $1`, [id]);
  return rows[0];
};

exports.deleteAttachment = async (id) => {
  const { rows } = await db.query(
    `DELETE FROM attachments WHERE id = $1 RETURNING filename`,
    [id]
  );
  return rows[0];
};
