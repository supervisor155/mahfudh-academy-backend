const classesService = require('./classes.service');
const db = require('../../db');
const notificationsService = require('../notifications/notifications.service');

exports.createClass = async (req, res) => {
  try {
    const { name, description, cover_color } = req.body;
    if (!name) return res.status(400).json({ message: 'Class name required' });
    const cls = await classesService.createClass({ name, description, created_by: req.user.id, cover_color });
    res.status(201).json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getClasses = async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const classes = await classesService.getClassesForUser(
      req.user.id, req.user.role, Number(limit), Number(offset)
    );
    res.json({ data: classes, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getClass = async (req, res) => {
  try {
    const cls = await classesService.getClassById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    // Attach member count for everyone
    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) as count FROM class_members WHERE class_id = $1',
      [req.params.id]
    );
    cls.memberCount = parseInt(countRows[0]?.count || 0, 10);

    const isAdmin = req.user.role === 'owner' || req.user.role === 'manager';
    const isMember = isAdmin || await classesService.isClassMember(req.params.id, req.user.id);

    if (!isMember) {
      // Non-members get a public preview: no invite code, flagged as preview
      const { invite_code, ...publicData } = cls;
      return res.json({ ...publicData, isMember: false, isPreview: true });
    }

    res.json({ ...cls, isMember: true, isPreview: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const { name, description, cover_color } = req.body;
    const updated = await classesService.updateClass(req.params.id, { name, description, cover_color });
    if (!updated) return res.status(404).json({ message: 'Class not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.setClassPrivacy = async (req, res) => {
  try {
    const isPrivate = req.body?.is_private;
    if (typeof isPrivate !== 'boolean') {
      return res.status(400).json({ message: 'is_private must be a boolean' });
    }

    const updated = await classesService.setClassPrivacy(req.params.id, isPrivate);
    if (!updated) return res.status(404).json({ message: 'Class not found' });

    return res.json({ data: updated });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    await classesService.deleteClass(req.params.id);
    res.json({ message: 'Class deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.joinByCode = async (req, res) => {
  try {
    const { invite_code } = req.body;
    if (!invite_code) return res.status(400).json({ message: 'Invite code required' });
    const member = await classesService.joinClassByCode(invite_code, req.user.id);
    res.status(201).json(member);
  } catch (err) {
    if (err.message === 'Invalid invite code') return res.status(404).json({ message: err.message });
    if (err.message === 'Already a member') return res.status(409).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

exports.getMembers = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const members = await classesService.getClassMembers(req.params.id, Number(limit), Number(offset));
    res.json({ data: members, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.removeMember = async (req, res) => {
  try {
    await classesService.removeMember(req.params.id, req.params.userId);
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const member = await classesService.addMemberByEmail(req.params.id, email);
    res.status(201).json(member);
  } catch (err) {
    if (err.message === 'No user found with that email') return res.status(404).json({ message: err.message });
    if (err.message === 'User is already a member of this class') return res.status(409).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

exports.regenerateCode = async (req, res) => {
  try {
    const newCode = await classesService.regenerateInviteCode(req.params.id);
    res.json({ invite_code: newCode });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /:id/request-access — student requests to join a class
exports.requestAccess = async (req, res) => {
  try {
    const classId = req.params.id;
    const cls = await classesService.getClassById(classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    // Already a member?
    const already = await classesService.isClassMember(classId, req.user.id);
    if (already) return res.status(409).json({ message: 'You are already a member of this class' });

    // Check for duplicate pending request
    const { rows: existing } = await db.query(
      `SELECT id FROM class_access_requests WHERE class_id = $1 AND user_id = $2 AND status = 'pending'`,
      [classId, req.user.id]
    );
    if (existing[0]) return res.status(409).json({ message: 'You already have a pending request for this class' });

    // Insert request
    const { rows } = await db.query(
      `INSERT INTO class_access_requests (class_id, user_id) VALUES ($1, $2) RETURNING *`,
      [classId, req.user.id]
    );

    // Notify the teacher/class creator
    const { rows: userRows } = await db.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const requesterName = userRows[0]?.name || 'A student';
    await notificationsService.createNotification({
      user_id: cls.created_by,
      type: 'access_request',
      message: `${requesterName} is requesting to join "${cls.name}"`,
      payload: { class_id: classId, requester_id: req.user.id, request_id: rows[0].id },
    });

    res.status(201).json({ message: 'Access request sent to the teacher' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /:id/access-requests — teacher views pending requests
exports.getAccessRequests = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.id, r.created_at, r.status,
              u.id as user_id, u.name, u.email
       FROM class_access_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.class_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /:id/access-requests/:requestId/approve — teacher approves
exports.approveAccessRequest = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE class_access_requests SET status = 'approved', resolved_at = NOW()
       WHERE id = $1 AND class_id = $2 AND status = 'pending' RETURNING *`,
      [req.params.requestId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Request not found or already resolved' });

    // Add to class_members
    await db.query(
      `INSERT INTO class_members (class_id, user_id, role)
       VALUES ($1, $2, 'student') ON CONFLICT DO NOTHING`,
      [req.params.id, rows[0].user_id]
    );

    // Notify the requester
    const cls = await classesService.getClassById(req.params.id);
    await notificationsService.createNotification({
      user_id: rows[0].user_id,
      type: 'access_approved',
      message: `Your request to join "${cls?.name}" has been approved!`,
      payload: { class_id: req.params.id },
    });

    res.json({ message: 'Request approved and student added to class' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /:id/access-requests/:requestId/decline — teacher declines
exports.declineAccessRequest = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE class_access_requests SET status = 'declined', resolved_at = NOW()
       WHERE id = $1 AND class_id = $2 AND status = 'pending' RETURNING *`,
      [req.params.requestId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Request not found or already resolved' });

    // Notify the requester
    const cls = await classesService.getClassById(req.params.id);
    await notificationsService.createNotification({
      user_id: rows[0].user_id,
      type: 'access_declined',
      message: `Your request to join "${cls?.name}" was declined.`,
      payload: { class_id: req.params.id },
    });

    res.json({ message: 'Request declined' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const isAdmin = req.user.role === 'owner' || req.user.role === 'manager';

    if (!isAdmin) {
      const isMember = await classesService.isClassMember(classId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: 'You are not a member of this class' });
      }
    }

    const { rows } = await db.query(
      `SELECT m.id, m.class_id, m.user_id, m.message, m.created_at,
              u.name AS user_name, u.role AS user_role
       FROM class_chat_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.class_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [classId, limit]
    );

    return res.json({ data: rows.reverse() });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
