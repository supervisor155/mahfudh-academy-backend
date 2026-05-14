const db = require('../../db');

exports.createModule = async ({ class_id, title, sort_order = 0 }) => {
  const { rows } = await db.query(
    `INSERT INTO modules (class_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *`,
    [class_id, title, sort_order]
  );
  return rows[0];
};

exports.getModulesByClass = async (class_id) => {
  const { rows } = await db.query(
    `SELECT m.*,
            COUNT(DISTINCT v.id) AS video_count,
            COUNT(DISTINCT r.id) AS reel_count
     FROM modules m
     LEFT JOIN videos v ON v.module_id = m.id AND v.deleted_at IS NULL
     LEFT JOIN reels  r ON r.module_id = m.id AND r.deleted_at IS NULL
     WHERE m.class_id = $1
     GROUP BY m.id
     ORDER BY m.sort_order ASC`,
    [class_id]
  );
  return rows;
};

exports.getModuleById = async (module_id) => {
  const { rows } = await db.query(`SELECT * FROM modules WHERE id = $1`, [module_id]);
  return rows[0];
};

exports.updateModule = async (module_id, { title, sort_order }) => {
  const { rows } = await db.query(
    `UPDATE modules
     SET title = COALESCE($1, title),
         sort_order = COALESCE($2, sort_order),
         updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [title, sort_order, module_id]
  );
  return rows[0];
};

exports.deleteModule = async (module_id) => {
  // Videos/reels inside will have their module_id set to NULL (ON DELETE SET NULL)
  await db.query(`DELETE FROM modules WHERE id = $1`, [module_id]);
};
