/**
 * requireClassMember middleware
 *
 * Verifies that the authenticated user belongs to the class implied by the
 * request. Some routers use `:id` for a class-owned resource like a video or
 * reel, so we must resolve that resource's owning class before checking
 * membership instead of assuming every `:id` is a class id.
 */
const db = require('../db');

const RESOURCE_CLASS_LOOKUPS = {
  '/api/announcements': {
    query: 'SELECT class_id FROM announcements WHERE id = $1 LIMIT 1',
  },
  '/api/assignments': {
    query: 'SELECT class_id FROM assignments WHERE id = $1 LIMIT 1',
  },
  '/api/attachments': {
    query: 'SELECT class_id FROM attachments WHERE id = $1 LIMIT 1',
  },
  '/api/curriculum': {
    query: 'SELECT class_id FROM modules WHERE id = $1 LIMIT 1',
  },
  '/api/reels': {
    query: 'SELECT class_id FROM reels WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
  },
  '/api/sessions': {
    query: 'SELECT class_id FROM live_sessions WHERE id = $1 LIMIT 1',
  },
  '/api/videos': {
    query: 'SELECT class_id FROM videos WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
  },
};

async function resolveClassId(req) {
  if (req.params.classId) return req.params.classId;
  if (req.query.class_id) return req.query.class_id;
  if (req.body?.class_id) return req.body.class_id;

  const resourceId = req.params.id;
  if (!resourceId) return null;

  const lookup = RESOURCE_CLASS_LOOKUPS[req.baseUrl];
  if (!lookup) return null;

  const { rows } = await db.query(lookup.query, [resourceId]);
  return rows[0]?.class_id || null;
}

module.exports = async (req, res, next) => {
  try {
    const classId = await resolveClassId(req);

    if (!classId) return next(); // no class context — let route handler decide

    const { rows } = await db.query(
      'SELECT id FROM class_members WHERE class_id = $1 AND user_id = $2',
      [classId, req.user.id]
    );

    if (!rows[0]) {
      return res.status(403).json({ message: 'Access denied: you are not a member of this class' });
    }

    req.classId = classId;
    next();
  } catch (err) {
    res.status(500).json({ message: 'Authorization check failed' });
  }
};
