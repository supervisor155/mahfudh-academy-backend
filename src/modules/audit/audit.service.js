const db = require('../../db');

exports.log = async ({ actor_id, action, target_table, target_id, metadata = {} }) => {
  // Fire-and-forget — never blocks the request
  db.query(
    `INSERT INTO audit_logs (actor_id, action, target_table, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [actor_id, action, target_table, target_id, JSON.stringify(metadata)]
  ).catch(() => {});
};

exports.getLogs = async ({ limit = 50, offset = 0, actor_id, target_table } = {}) => {
  const params  = [];
  let   where   = 'WHERE 1=1';

  if (actor_id) {
    params.push(actor_id);
    where += ` AND al.actor_id = $${params.length}`;
  }
  if (target_table) {
    params.push(target_table);
    where += ` AND al.target_table = $${params.length}`;
  }

  params.push(limit, offset);
  const query = `
    SELECT al.*, u.name AS actor_name
    FROM audit_logs al LEFT JOIN users u ON al.actor_id = u.id
    ${where}
    ORDER BY al.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const { rows } = await db.query(query, params);
  return rows;
};
