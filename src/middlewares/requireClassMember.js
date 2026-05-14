/**
 * requireClassMember middleware
 *
 * Verifies that the authenticated user is a member of the class referenced
 * in the request. The class ID is resolved in this priority order:
 *   1. req.params.classId (explicit route param)
 *   2. req.params.id      (e.g. /classes/:id routes)
 *   3. req.query.class_id  (GET with query string)
 *   4. req.body.class_id   (POST body)
 *
 * Teachers/owners/managers can always access any class they're a member of.
 * Responds 403 if the user is not a member.
 */
const db = require('../db');

module.exports = async (req, res, next) => {
  try {
    const classId =
      req.params.classId ||
      req.params.id ||
      req.query.class_id ||
      req.body?.class_id;

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
