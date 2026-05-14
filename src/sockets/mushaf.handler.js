/**
 * MUSHAF COLLABORATION HANDLER
 *
 * Teacher can "raise" the Mushaf for their class — broadcasting the current
 * surah + ayah to all students in the class room. Students receive the event
 * and are prompted to open the Mushaf at that position.
 *
 * Room: `class:{class_id}`
 *
 * Client → Server:
 *   mushaf:raise   { class_id, surah_id, ayah_number, surah_name }
 *   mushaf:lower   { class_id }
 *   mushaf:scroll  { class_id, ayah_number }   (teacher scrolls, students follow)
 *
 * Server → Client (broadcast to class room):
 *   mushaf:raised  { surah_id, ayah_number, surah_name, teacher: { id, name } }
 *   mushaf:lowered {}
 *   mushaf:scrolled { ayah_number }
 */

const db = require('../db');

// In-memory: class_id -> { surah_id, ayah_number, surah_name, teacher_id }
const raisedMushaf = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    const user = socket.user;

    // Teacher raises the Mushaf for their class
    socket.on('mushaf:raise', async ({ class_id, surah_id, ayah_number, surah_name }) => {
      if (!class_id || !surah_id) return;

      // Only teachers/owners/managers can raise
      if (!['teacher', 'owner', 'manager'].includes(user.role)) return;

      // Verify the teacher belongs to this class
      try {
        const { rows } = await db.query(
          `SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2 LIMIT 1`,
          [class_id, user.id]
        );
        if (rows.length === 0) return;
      } catch { return; }

      const payload = {
        surah_id,
        ayah_number: ayah_number || 1,
        surah_name: surah_name || '',
        teacher: { id: user.id, name: user.name },
      };

      raisedMushaf.set(String(class_id), { ...payload, teacher_id: user.id });

      // Broadcast to all students in the class room
      io.to(`class:${class_id}`).emit('mushaf:raised', payload);
    });

    // Teacher lowers the Mushaf (dismiss prompt)
    socket.on('mushaf:lower', ({ class_id }) => {
      if (!class_id) return;
      if (!['teacher', 'owner', 'manager'].includes(user.role)) return;
      raisedMushaf.delete(String(class_id));
      io.to(`class:${class_id}`).emit('mushaf:lowered', {});
    });

    // Teacher scrolls — students follow in real-time
    socket.on('mushaf:scroll', ({ class_id, ayah_number }) => {
      if (!class_id || !ayah_number) return;
      if (!['teacher', 'owner', 'manager'].includes(user.role)) return;
      socket.to(`class:${class_id}`).emit('mushaf:scrolled', { ayah_number });
    });

    // When a student joins a class room, send current raised state if any
    socket.on('class:join', ({ class_id }) => {
      if (!class_id) return;
      socket.join(`class:${class_id}`);
      const current = raisedMushaf.get(String(class_id));
      if (current) {
        socket.emit('mushaf:raised', {
          surah_id: current.surah_id,
          ayah_number: current.ayah_number,
          surah_name: current.surah_name,
          teacher: { id: current.teacher_id, name: current.teacher_name || 'Teacher' },
        });
      }
    });

    socket.on('class:leave', ({ class_id }) => {
      if (class_id) socket.leave(`class:${class_id}`);
    });
  });
};
