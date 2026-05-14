const db = require('../../db');
const crypto = require('crypto');

const generateInviteCode = () => crypto.randomBytes(8).toString('hex');

exports.createClass = async ({ name, description, created_by, cover_color = 'teal' }) => {
  const invite_code = generateInviteCode();
  const { rows } = await db.query(
    `INSERT INTO classes (name, description, created_by, invite_code, cover_color)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, description, created_by, invite_code, cover_color]
  );
  return rows[0];
};

exports.getClassById = async (class_id) => {
  const { rows } = await db.query('SELECT * FROM classes WHERE id = $1 AND deleted_at IS NULL', [class_id]);
  return rows[0];
};

exports.getAllClasses = async (limit = 20, offset = 0) => {
  const { rows } = await db.query(
    'SELECT id, name, description, created_by, invite_code, created_at FROM classes WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return rows;
};

exports.getClassesForUser = async (user_id, user_role, limit = 20, offset = 0) => {
  const isAdmin = user_role === 'owner' || user_role === 'manager';

  if (isAdmin) {
    const { rows } = await db.query(
      `SELECT c.*, COUNT(DISTINCT cm.user_id)::int AS "memberCount", 0::int AS progress
       FROM classes c
       LEFT JOIN class_members cm ON cm.class_id = c.id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id ORDER BY c.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  }

  if (user_role === 'teacher') {
    const { rows } = await db.query(
      `SELECT c.*, COUNT(DISTINCT cm.user_id)::int AS "memberCount", 0::int AS progress
       FROM classes c
       LEFT JOIN class_members cm ON cm.class_id = c.id
       WHERE c.deleted_at IS NULL
         AND (c.created_by = $1
           OR EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.id AND m.user_id = $1))
       GROUP BY c.id ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
      [user_id, limit, offset]
    );
    return rows;
  }

  // Students: enrolled classes + real assignment progress
  const { rows } = await db.query(
    `SELECT c.*,
            COUNT(DISTINCT cm.user_id)::int AS "memberCount",
            CASE
              WHEN COUNT(DISTINCT a.id) = 0 THEN 0
              ELSE ROUND(COUNT(DISTINCT sub.id)::numeric / COUNT(DISTINCT a.id) * 100)::int
            END AS progress
     FROM classes c
     INNER JOIN class_members my_m ON my_m.class_id = c.id AND my_m.user_id = $1
     LEFT JOIN class_members cm ON cm.class_id = c.id
     LEFT JOIN assignments a ON a.class_id = c.id
     LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = $1
     WHERE c.deleted_at IS NULL
     GROUP BY c.id ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
    [user_id, limit, offset]
  );
  return rows;
};

exports.updateClass = async (class_id, { name, description, cover_color }) => {
  const { rows } = await db.query(
    `UPDATE classes SET name = COALESCE($1, name), description = COALESCE($2, description),
     cover_color = COALESCE($3, cover_color), updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [name, description, cover_color, class_id]
  );
  return rows[0];
};

exports.setClassPrivacy = async (class_id, is_private) => {
  const { rows } = await db.query(
    `UPDATE classes
     SET is_private = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, name, is_private, updated_at`,
    [is_private, class_id]
  );
  return rows[0];
};

exports.deleteClass = async (class_id) => {
  // Soft delete — data is preserved, cascade deletes are avoided
  await db.query('UPDATE classes SET deleted_at = NOW() WHERE id = $1', [class_id]);
};

exports.joinClassByCode = async (invite_code, user_id) => {
  const { rows: classRows } = await db.query(
    'SELECT id FROM classes WHERE LOWER(invite_code) = LOWER($1) AND deleted_at IS NULL',
    [invite_code]
  );
  if (!classRows[0]) throw new Error('Invalid invite code');
  const class_id = classRows[0].id;

  // Check already a member
  const { rows: existing } = await db.query(
    'SELECT id FROM class_members WHERE class_id = $1 AND user_id = $2',
    [class_id, user_id]
  );
  if (existing[0]) throw new Error('Already a member');

  const { rows } = await db.query(
    `INSERT INTO class_members (class_id, user_id, role) VALUES ($1, $2, 'student') RETURNING *`,
    [class_id, user_id]
  );
  return rows[0];
};

exports.getClassMembers = async (class_id, limit = 50, offset = 0) => {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.role, cm.role as class_role, cm.joined_at
     FROM class_members cm
     JOIN users u ON cm.user_id = u.id
     WHERE cm.class_id = $1
     ORDER BY cm.joined_at ASC LIMIT $2 OFFSET $3`,
    [class_id, limit, offset]
  );
  return rows;
};

exports.isClassMember = async (class_id, user_id) => {
  const { rows } = await db.query(
    'SELECT id FROM class_members WHERE class_id = $1 AND user_id = $2',
    [class_id, user_id]
  );
  return !!rows[0];
};

exports.removeMember = async (class_id, user_id) => {
  await db.query(
    'DELETE FROM class_members WHERE class_id = $1 AND user_id = $2',
    [class_id, user_id]
  );
};

exports.addMemberByEmail = async (class_id, email) => {
  // Find user by email
  const { rows: userRows } = await db.query(
    'SELECT id, name, email, role FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  if (!userRows[0]) throw new Error('No user found with that email');
  const targetUser = userRows[0];

  // Check already a member
  const { rows: existing } = await db.query(
    'SELECT id FROM class_members WHERE class_id = $1 AND user_id = $2',
    [class_id, targetUser.id]
  );
  if (existing[0]) throw new Error('User is already a member of this class');

  const { rows } = await db.query(
    `INSERT INTO class_members (class_id, user_id, role) VALUES ($1, $2, 'student') RETURNING *`,
    [class_id, targetUser.id]
  );
  return { ...rows[0], name: targetUser.name, email: targetUser.email };
};

exports.regenerateInviteCode = async (class_id) => {
  const newCode = require('crypto').randomBytes(8).toString('hex');
  const { rows } = await db.query(
    'UPDATE classes SET invite_code = $1, updated_at = NOW() WHERE id = $2 RETURNING invite_code',
    [newCode, class_id]
  );
  return rows[0]?.invite_code;
};
