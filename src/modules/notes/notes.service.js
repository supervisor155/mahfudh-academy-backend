const db = require('../../db');

// ─── Helpers ───────────────────────────────────────────────────────────────

// Extract surah number from ayah_id like "2:255" → 2
function _parseSurahId(ayah_id) {
  const n = parseInt((ayah_id || '').split(':')[0], 10);
  return Number.isFinite(n) && n >= 1 && n <= 114 ? n : null;
}

// ─── Create ────────────────────────────────────────────────────────────────

exports.createNote = async ({ user_id, ayah_id, note, type = 'text', tags = [], color, page_ref, word_range }) => {
  const surah_id = _parseSurahId(ayah_id);
  const { rows } = await db.query(
    `INSERT INTO notes
       (user_id, ayah_id, note, type, tags, color, page_ref, surah_id, word_range)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      user_id,
      ayah_id,
      JSON.stringify(note),
      type,
      tags,
      color || null,
      page_ref || null,
      surah_id,
      word_range ? JSON.stringify(word_range) : null,
    ]
  );
  return rows[0];
};

// ─── Read (with filters) ───────────────────────────────────────────────────

exports.getNotesByUser = async (user_id, { limit = 50, offset = 0, type, tags, surah_id, is_pinned, is_archived = false } = {}) => {
  const conditions = ['user_id = $1', 'deleted_at IS NULL', `is_archived = $2`];
  const values = [user_id, is_archived];
  let i = 3;

  if (type) { conditions.push(`type = $${i++}`); values.push(type); }
  if (surah_id) { conditions.push(`surah_id = $${i++}`); values.push(Number(surah_id)); }
  if (is_pinned === true || is_pinned === 'true') { conditions.push(`is_pinned = TRUE`); }
  if (tags && tags.length) {
    conditions.push(`tags && $${i++}`);   // overlaps operator
    values.push(Array.isArray(tags) ? tags : [tags]);
  }

  const where = conditions.join(' AND ');
  const { rows } = await db.query(
    `SELECT n.*, nf_agg.feedback
     FROM notes n
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
         'id', nf.id, 'teacher_id', nf.teacher_id,
         'comment', nf.comment, 'created_at', nf.created_at
       )) AS feedback
       FROM note_feedback nf WHERE nf.note_id = n.id
     ) nf_agg ON TRUE
     WHERE ${where}
     ORDER BY n.is_pinned DESC, n.updated_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...values, Number(limit), Number(offset)]
  );
  return rows;
};

exports.getNoteByAyah = async (user_id, ayah_id) => {
  const { rows } = await db.query(
    `SELECT * FROM notes
     WHERE user_id = $1 AND ayah_id = $2 AND deleted_at IS NULL`,
    [user_id, ayah_id]
  );
  return rows; // may have multiple types per ayah
};

exports.getNotesBySurah = async (user_id, surah_id) => {
  const { rows } = await db.query(
    `SELECT * FROM notes
     WHERE user_id = $1 AND surah_id = $2 AND deleted_at IS NULL
     ORDER BY ayah_id ASC, created_at ASC`,
    [user_id, Number(surah_id)]
  );
  return rows;
};

// ─── Full-text search ──────────────────────────────────────────────────────

exports.searchNotes = async (user_id, query) => {
  const { rows } = await db.query(
    `SELECT * FROM notes
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND note::text ILIKE $2
     ORDER BY updated_at DESC
     LIMIT 50`,
    [user_id, `%${query}%`]
  );
  return rows;
};

// ─── Update ────────────────────────────────────────────────────────────────

exports.updateNote = async (note_id, user_id, fields) => {
  const allowed = ['note', 'type', 'tags', 'color', 'page_ref', 'word_range'];
  const sets = [];
  const values = [];
  let i = 1;

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      const val = (key === 'note' || key === 'word_range') ? JSON.stringify(fields[key]) : fields[key];
      values.push(val);
    }
  }

  if (!sets.length) return null;
  sets.push(`updated_at = NOW()`);
  values.push(note_id, user_id);

  const { rows } = await db.query(
    `UPDATE notes SET ${sets.join(', ')}
     WHERE id = $${i++} AND user_id = $${i++} AND deleted_at IS NULL
     RETURNING *`,
    values
  );
  return rows[0];
};

exports.togglePin = async (note_id, user_id) => {
  const { rows } = await db.query(
    `UPDATE notes SET is_pinned = NOT is_pinned, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *`,
    [note_id, user_id]
  );
  return rows[0];
};

exports.toggleArchive = async (note_id, user_id) => {
  const { rows } = await db.query(
    `UPDATE notes SET is_archived = NOT is_archived, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *`,
    [note_id, user_id]
  );
  return rows[0];
};

// ─── Soft Delete ───────────────────────────────────────────────────────────

exports.softDeleteNote = async (note_id, user_id) => {
  const { rows } = await db.query(
    `UPDATE notes SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
    [note_id, user_id]
  );
  return rows[0];
};

// ─── Sharing ───────────────────────────────────────────────────────────────

exports.shareNote = async (note_id, user_id, class_id) => {
  // Verify user is a member of the class
  const { rows: membership } = await db.query(
    `SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2`,
    [class_id, user_id]
  );
  if (!membership.length) return null;

  const { rows } = await db.query(
    `UPDATE notes SET shared_class_id = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING *`,
    [class_id, note_id, user_id]
  );
  return rows[0];
};

exports.unshareNote = async (note_id, user_id) => {
  const { rows } = await db.query(
    `UPDATE notes SET shared_class_id = NULL, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *`,
    [note_id, user_id]
  );
  return rows[0];
};

exports.getSharedNotesByClass = async (class_id, limit = 50, offset = 0) => {
  const { rows } = await db.query(
    `SELECT n.*, u.name AS author_name, u.role AS author_role
     FROM notes n JOIN users u ON n.user_id = u.id
     WHERE n.shared_class_id = $1 AND n.deleted_at IS NULL
     ORDER BY n.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [class_id, Number(limit), Number(offset)]
  );
  return rows;
};

// ─── Teacher Feedback ──────────────────────────────────────────────────────

exports.addFeedback = async (note_id, teacher_id, comment) => {
  const { rows } = await db.query(
    `INSERT INTO note_feedback (note_id, teacher_id, comment)
     VALUES ($1, $2, $3) RETURNING *`,
    [note_id, teacher_id, comment]
  );
  return rows[0];
};

exports.getFeedback = async (note_id) => {
  const { rows } = await db.query(
    `SELECT nf.*, u.name AS teacher_name
     FROM note_feedback nf JOIN users u ON nf.teacher_id = u.id
     WHERE nf.note_id = $1 ORDER BY nf.created_at ASC`,
    [note_id]
  );
  return rows;
};

// ─── Offline-first Delta Sync ──────────────────────────────────────────────

exports.getNotesSince = async (user_id, since) => {
  const { rows } = await db.query(
    `SELECT * FROM notes
     WHERE user_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [user_id, new Date(since)]
  );
  return rows;
};
