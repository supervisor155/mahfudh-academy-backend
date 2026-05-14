/**
 * LIVE SESSION (PRESENCE + SIGNALING) HANDLER
 * Room: `session:{session_id}`
 *
 * Events emitted by client:
 *   session:join        { session_id }
 *   session:leave       { session_id }
 *   session:signal      { session_id, to_user_id, signal }   (SFU offer/answer/ice)
 *
 * Events emitted by server:
 *   session:user_joined { user: { id, name, role }, participants_count }
 *   session:user_left   { user_id, participants_count }
 *   session:signal      { from_user_id, signal }
 *   session:chat:history { session_id, messages }
 *   session:chat:closed  { session_id }
 */
const db = require('../db');
const { getActiveChatRestriction } = require('../modules/security/security.service');

// In-memory presence store: session_id -> Set<user_id>
const presence = new Map();
// In-memory session-chat presence: session_id -> Map<user_id, { user, count }>
const chatPresence = new Map();
// In-memory temporary chat history (cleared when session ends)
const sessionChatHistory = new Map();
// In-memory countdown store: class_id -> { session_id, title, scheduled_start, teacher }
const countdowns = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    socket.on('live:countdown:schedule', ({ class_id, session_id, title, scheduled_start }) => {
      if (!class_id || !scheduled_start) return;
      if (!['teacher', 'owner', 'manager'].includes(socket.user.role)) return;

      const payload = {
        class_id,
        session_id: session_id || null,
        title: title || 'Live session',
        scheduled_start,
        teacher: { id: socket.user.id, name: socket.user.name },
      };

      countdowns.set(String(class_id), payload);
      io.to(`class:${class_id}`).emit('live:countdown:scheduled', payload);
    });

    socket.on('live:countdown:cancel', ({ class_id, session_id }) => {
      if (!class_id) return;
      if (!['teacher', 'owner', 'manager'].includes(socket.user.role)) return;
      countdowns.delete(String(class_id));
      io.to(`class:${class_id}`).emit('live:countdown:cancelled', {
        class_id,
        session_id: session_id || null,
      });
    });

    socket.on('class:join', ({ class_id }) => {
      if (!class_id) return;
      const current = countdowns.get(String(class_id));
      if (current) {
        socket.emit('live:countdown:scheduled', current);
      }
    });

    socket.on('session:join', ({ session_id }) => {
      if (!session_id) return;
      socket.join(`session:${session_id}`);
      if (!presence.has(session_id)) presence.set(session_id, new Set());
      presence.get(session_id).add(socket.user.id);

      io.to(`session:${session_id}`).emit('session:user_joined', {
        user: { id: socket.user.id, name: socket.user.name, role: socket.user.role },
        participants_count: presence.get(session_id).size,
      });
    });

    socket.on('session:leave', ({ session_id }) => {
      _handleLeave(io, socket, session_id);
      _handleChatLeave(io, socket, session_id);
    });

    socket.on('session:chat:join', async ({ session_id }) => {
      if (!session_id) return;

      const isLive = await _isSessionLive(session_id);
      if (!isLive) {
        socket.emit('session:chat:closed', { session_id });
        return;
      }

      socket.join(`session:${session_id}`);

      const key = String(session_id);
      if (!chatPresence.has(key)) chatPresence.set(key, new Map());
      const room = chatPresence.get(key);
      const current = room.get(socket.user.id);

      if (current) current.count += 1;
      else {
        room.set(socket.user.id, {
          count: 1,
          user: { id: socket.user.id, name: socket.user.name, role: socket.user.role },
        });
      }

      socket.emit('session:chat:history', {
        session_id,
        messages: sessionChatHistory.get(key) || [],
      });
      _emitChatOnline(io, session_id);
    });

    socket.on('session:chat:leave', ({ session_id }) => {
      _handleChatLeave(io, socket, session_id);
    });

    socket.on('session:chat:send', async ({ session_id, message }) => {
      if (!session_id || !message) return;
      const text = String(message).trim();
      if (!text) return;

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

      const isLive = await _isSessionLive(session_id);
      if (!isLive) {
        socket.emit('session:chat:closed', { session_id });
        return;
      }

      const payload = {
        session_id,
        from: { id: socket.user.id, name: socket.user.name, role: socket.user.role },
        message: text,
        sent_at: new Date().toISOString(),
      };

      const key = String(session_id);
      const history = sessionChatHistory.get(key) || [];
      history.push(payload);
      // Keep only latest 100 temporary messages per live session.
      sessionChatHistory.set(key, history.slice(-100));

      io.to(`session:${session_id}`).emit('session:chat:message', payload);
    });

    socket.on('session:chat:clear', ({ session_id }) => {
      if (!session_id) return;
      if (!['teacher', 'owner', 'manager'].includes(socket.user.role)) return;
      _clearSessionChat(io, session_id);
    });

    // SFU signaling relay (offer/answer/ICE) with FEC support hints
    socket.on('session:signal', ({ session_id, to_user_id, signal }) => {
      if (!session_id || !to_user_id || !signal) return;
      
      // Inject Low-Bandwidth FEC (Forward Error Correction) hints if signal is SDP
      if (signal.type === 'offer' || signal.type === 'answer') {
        signal.sdp = _injectLowBandwidthHints(signal.sdp);
      }

      socket.to(`session:${session_id}`).emit('session:signal', {
        from_user_id: socket.user.id,
        signal,
      });
    });

    socket.on('disconnecting', () => {
      socket.rooms.forEach((room) => {
        if (room.startsWith('session:')) {
          const session_id = room.replace('session:', '');
          _handleLeave(io, socket, session_id);
          _handleChatLeave(io, socket, session_id);
        }
      });
    });
  });
};

/**
 * Optimizes the WebRTC SDP for low bandwidth
 */
function _injectLowBandwidthHints(sdp) {
  if (!sdp) return sdp;
  // Prioritize Opus for audio (best for low bandwidth)
  // Force lower starting bitrates and enable FEC
  return sdp
    .replace('useinbandfec=1', 'useinbandfec=1;usedtx=1') // DTX saves bandwidth during silence
    .replace('maxaveragebitrate=128000', 'maxaveragebitrate=24000'); // Force ultra-low bitrate for survival
}

function _handleLeave(io, socket, session_id) {
  socket.leave(`session:${session_id}`);
  const members = presence.get(session_id);
  if (members) {
    members.delete(socket.user.id);
    if (members.size === 0) presence.delete(session_id);
  }
  io.to(`session:${session_id}`).emit('session:user_left', {
    user_id: socket.user.id,
    participants_count: presence.get(session_id)?.size ?? 0,
  });
}

function _handleChatLeave(io, socket, session_id) {
  if (!session_id) return;
  const key = String(session_id);
  const room = chatPresence.get(key);
  if (!room) return;

  const current = room.get(socket.user.id);
  if (!current) return;

  current.count -= 1;
  if (current.count <= 0) room.delete(socket.user.id);
  if (room.size === 0) chatPresence.delete(key);

  _emitChatOnline(io, session_id);
}

function _emitChatOnline(io, session_id) {
  const key = String(session_id);
  const users = Array.from(chatPresence.get(key)?.values() || []).map((v) => v.user);
  io.to(`session:${session_id}`).emit('session:chat:online', {
    session_id,
    users,
  });
}

async function _isSessionLive(session_id) {
  try {
    const { rows } = await db.query(
      'SELECT id, ended_at, started_at FROM live_sessions WHERE id = $1 LIMIT 1',
      [session_id]
    );
    const row = rows[0];
    if (!row) return false;
    return !!row.started_at && !row.ended_at;
  } catch {
    return false;
  }
}

function _clearSessionChat(io, session_id) {
  const key = String(session_id);
  sessionChatHistory.delete(key);
  chatPresence.delete(key);
  io.to(`session:${session_id}`).emit('session:chat:closed', { session_id });
  io.to(`session:${session_id}`).emit('session:chat:online', { session_id, users: [] });
}

module.exports.clearSessionChat = (io, session_id) => {
  _clearSessionChat(io, session_id);
};
