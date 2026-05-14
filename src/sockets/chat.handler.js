/**
 * CHAT HANDLER
 *
 * Class chat room: `class:{class_id}`
 * Direct chat room (logical key only): `dm:{min_user_id}:{max_user_id}`
 *
 * Class Events:
 *   chat:join / chat:leave / chat:send
 *   -> chat:message, chat:online
 *
 * Direct Events:
 *   chat:dm:open  { peer_id }
 *   chat:dm:send  { to_user_id, message }
 *   -> chat:dm:history, chat:dm:message
 *
 * Presence Events:
 *   chat:user:presence      { user_id, online }
 *   chat:users:presence:get { user_ids }
 *   -> chat:users:presence  { users: [{ user_id, online }] }
 */
const db = require('../db');
const { getActiveChatRestriction } = require('../modules/security/security.service');

// class_id -> Map<user_id, { user, count }>
const classPresence = new Map();
// user_id -> number of active sockets
const userPresence = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    socket.data.chatClasses = new Set();
    socket.join(`user:${socket.user.id}`);

    _incrementUserPresence(io, socket.user.id);

    socket.on('chat:join', async ({ class_id }) => {
      const classId = Number(class_id);
      if (!classId) return;

      // Only class members can join class chat room.
      try {
        const { rows } = await db.query(
          'SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2 LIMIT 1',
          [classId, socket.user.id]
        );
        if (!rows[0]) return;
      } catch {
        return;
      }

      socket.join(`class:${classId}`);
      socket.data.chatClasses.add(String(classId));

      const profile = await _getUserProfile(socket.user.id);

      if (!classPresence.has(String(classId))) {
        classPresence.set(String(classId), new Map());
      }

      const roomPresence = classPresence.get(String(classId));
      const current = roomPresence.get(socket.user.id);

      if (current) {
        current.count += 1;
      } else {
        roomPresence.set(socket.user.id, {
          count: 1,
          user: profile,
        });
      }

      _emitPresence(io, classId);
    });

    socket.on('chat:leave', ({ class_id }) => {
      if (!class_id) return;
      socket.leave(`class:${class_id}`);
      socket.data.chatClasses.delete(String(class_id));
      _decrementPresence(io, class_id, socket.user.id);
    });

    socket.on('chat:send', async ({ class_id, message }) => {
      const classId = Number(class_id);
      const text = String(message || '').trim();
      if (!classId || !text) return;

      let restriction = null;
      try {
        restriction = await getActiveChatRestriction(socket.user.id);
      } catch {
        restriction = null;
      }
      if (restriction) {
        socket.emit('system:chat_restricted', {
          reason: restriction.reason,
          muted_until: restriction.muted_until,
        });
        return;
      }

      try {
        const { rows: memberRows } = await db.query(
          'SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2 LIMIT 1',
          [classId, socket.user.id]
        );
        if (!memberRows[0]) return;

        const profile = await _getUserProfile(socket.user.id);
        const { rows } = await db.query(
          `INSERT INTO class_chat_messages (class_id, user_id, message)
           VALUES ($1, $2, $3)
           RETURNING id, created_at`,
          [classId, socket.user.id, text]
        );

        io.to(`class:${classId}`).emit('chat:message', {
          id: rows[0].id,
          from: profile,
          message: text,
          sent_at: rows[0].created_at,
        });
      } catch {
        // Ignore transient DB failures and keep socket alive.
      }
    });

    socket.on('chat:dm:open', async ({ peer_id }) => {
      const pid = Number(peer_id);
      if (!pid || pid === socket.user.id) return;

      try {
        const { rows } = await db.query(
          `SELECT dm.id, dm.from_user, dm.to_user, dm.message, dm.created_at,
                  fu.name AS from_name, fu.role AS from_role
           FROM direct_messages dm
           JOIN users fu ON fu.id = dm.from_user
           WHERE (dm.from_user = $1 AND dm.to_user = $2)
              OR (dm.from_user = $2 AND dm.to_user = $1)
           ORDER BY dm.created_at DESC
           LIMIT 100`,
          [socket.user.id, pid]
        );

        socket.emit('chat:dm:history', {
          peer_id: pid,
          messages: rows.reverse().map((row) => ({
            id: row.id,
            from: { id: row.from_user, name: row.from_name, role: row.from_role },
            to_user_id: row.to_user,
            message: row.message,
            sent_at: row.created_at,
          })),
        });

        await db.query(
          `UPDATE direct_messages
           SET is_read = TRUE
           WHERE to_user = $1 AND from_user = $2 AND is_read = FALSE`,
          [socket.user.id, pid]
        );
      } catch {
        socket.emit('chat:dm:history', { peer_id: pid, messages: [] });
      }
    });

    socket.on('chat:dm:send', async ({ to_user_id, message }) => {
      const target = Number(to_user_id);
      const text = String(message || '').trim();
      if (!target || !text || target === socket.user.id) return;

      let restriction = null;
      try {
        restriction = await getActiveChatRestriction(socket.user.id);
      } catch {
        restriction = null;
      }
      if (restriction) {
        socket.emit('system:chat_restricted', {
          reason: restriction.reason,
          muted_until: restriction.muted_until,
        });
        return;
      }

      try {
        const profile = await _getUserProfile(socket.user.id);
        const { rows } = await db.query(
          `INSERT INTO direct_messages (from_user, to_user, message)
           VALUES ($1, $2, $3)
           RETURNING id, created_at`,
          [socket.user.id, target, text]
        );

        const payload = {
          id: rows[0].id,
          from: profile,
          to_user_id: target,
          message: text,
          sent_at: rows[0].created_at,
        };

        io.to(`user:${socket.user.id}`).emit('chat:dm:message', payload);
        io.to(`user:${target}`).emit('chat:dm:message', payload);
      } catch {
        // Ignore transient DB failures and keep socket alive.
      }
    });

    socket.on('chat:users:presence:get', ({ user_ids }) => {
      const ids = Array.isArray(user_ids) ? user_ids.map(Number).filter(Boolean) : [];
      socket.emit('chat:users:presence', {
        users: ids.map((id) => ({ user_id: id, online: _isUserOnline(id) })),
      });
    });

    socket.on('disconnecting', () => {
      socket.data.chatClasses?.forEach((class_id) => {
        _decrementPresence(io, class_id, socket.user.id);
      });

      _decrementUserPresence(io, socket.user.id);
    });
  });
};

function _decrementPresence(io, class_id, user_id) {
  const key = String(class_id);
  const roomPresence = classPresence.get(key);
  if (!roomPresence) return;

  const current = roomPresence.get(user_id);
  if (!current) return;

  current.count -= 1;
  if (current.count <= 0) {
    roomPresence.delete(user_id);
  }

  if (roomPresence.size === 0) {
    classPresence.delete(key);
  }

  _emitPresence(io, class_id);
}

function _emitPresence(io, class_id) {
  const users = Array.from(classPresence.get(String(class_id))?.values() || []).map((v) => v.user);
  io.to(`class:${class_id}`).emit('chat:online', {
    class_id,
    users,
  });
}

function _isUserOnline(user_id) {
  return (userPresence.get(Number(user_id)) || 0) > 0;
}

function _incrementUserPresence(io, user_id) {
  const id = Number(user_id);
  const prev = userPresence.get(id) || 0;
  userPresence.set(id, prev + 1);
  if (prev === 0) {
    io.emit('chat:user:presence', { user_id: id, online: true });
  }
}

function _decrementUserPresence(io, user_id) {
  const id = Number(user_id);
  const prev = userPresence.get(id) || 0;
  if (prev <= 1) {
    userPresence.delete(id);
    io.emit('chat:user:presence', { user_id: id, online: false });
    return;
  }
  userPresence.set(id, prev - 1);
}

async function _getUserProfile(userId) {
  try {
    const { rows } = await db.query(
      'SELECT id, name, role FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );

    const user = rows[0] || {};
    return {
      id: Number(user.id) || Number(userId),
      name: user.name || 'User',
      role: user.role || 'student',
    };
  } catch {
    return {
      id: Number(userId),
      name: 'User',
      role: 'student',
    };
  }
}
