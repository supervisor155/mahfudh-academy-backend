const sessionsService = require('./liveSessions.service');
const db = require('../../db');
const notificationsService = require('../notifications/notifications.service');
const { getIo } = require('../../utils/realtime');
const sessionSocketHandler = require('../../sockets/session.handler');

exports.createSession = async (req, res) => {
  try {
    const { class_id, title, scheduled_start, start_now } = req.body;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });

    const shouldStartNow = start_now !== false && !scheduled_start;
    const plannedStart = scheduled_start ? new Date(scheduled_start) : null;

    if (plannedStart && Number.isNaN(plannedStart.getTime())) {
      return res.status(400).json({ message: 'scheduled_start must be a valid date' });
    }
    if (plannedStart && plannedStart <= new Date()) {
      return res.status(400).json({ message: 'scheduled_start must be in the future' });
    }

    const session = await sessionsService.createSession({
      class_id,
      created_by: req.user.id,
      title,
      scheduled_start: plannedStart ? plannedStart.toISOString() : null,
      start_now: shouldStartNow,
    });

    // If scheduled, notify all class students and broadcast countdown event.
    if (!shouldStartNow && plannedStart) {
      const { rows: students } = await db.query(
        `SELECT user_id FROM class_members WHERE class_id = $1 AND role = 'student'`,
        [class_id]
      );

      await Promise.allSettled(students.map((s) =>
        notificationsService.createNotification({
          user_id: s.user_id,
          type: 'live_session_upcoming',
          message: `${req.user.name || 'Your teacher'} scheduled a live session`,
          payload: {
            class_id,
            session_id: session.id,
            title: title || `Session #${session.id}`,
            scheduled_start: plannedStart.toISOString(),
          },
        })
      ));

      getIo()?.to(`class:${class_id}`).emit('live:countdown:scheduled', {
        class_id,
        session_id: session.id,
        title: title || `Session #${session.id}`,
        scheduled_start: plannedStart.toISOString(),
        teacher: { id: req.user.id, name: req.user.name },
      });
    }

    // Signaling is handled via Socket.io — no external token needed
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.endSession = async (req, res) => {
  try {
    const session = await sessionsService.endSession(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const io = getIo();
    if (io) {
      // Notify clients that the live session and temporary chat are closed.
      io.to(`session:${session.id}`).emit('session:ended', { session_id: session.id });
      sessionSocketHandler.clearSessionChat?.(io, session.id);
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const { class_id, limit = 10, offset = 0 } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });
    const sessions = await sessionsService.getSessionsByClass(class_id, Number(limit), Number(offset));
    res.json({ data: sessions, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSession = async (req, res) => {
  try {
    const session = await sessionsService.getSessionById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.joinSession = async (req, res) => {
  try {
    const session = await sessionsService.getSessionById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.ended_at) return res.status(400).json({ message: 'This session has already ended' });

    // Verify the user is a member of the class this session belongs to
    const { rows: memberRows } = await db.query(
      'SELECT id FROM class_members WHERE class_id = $1 AND user_id = $2',
      [session.class_id, req.user.id]
    );
    if (!memberRows[0]) {
      return res.status(403).json({ message: 'Access denied: you are not a member of this class' });
    }

    await sessionsService.joinSession(req.params.id, req.user.id);

    // Client connects via Socket.io room `session:{id}` — no external token needed
    res.json({ 
      message: 'Joined session',
      room_id: session.metadata?.room_id || `room-${session.id}`,
      session_id: session.id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.leaveSession = async (req, res) => {
  try {
    await sessionsService.leaveSession(req.params.id, req.user.id);
    res.json({ message: 'Left session' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getParticipants = async (req, res) => {
  try {
    const participants = await sessionsService.getParticipants(req.params.id);
    res.json({ data: participants });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
