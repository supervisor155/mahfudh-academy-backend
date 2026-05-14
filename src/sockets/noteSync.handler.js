/**
 * NOTE SYNC HANDLER
 * Room: `user:{user_id}` (per-user sync, private)
 *
 * Events emitted by client:
 *   note:push_diff  { ayah_id, diff, client_updated_at }
 *
 * Events emitted by server:
 *   note:ack        { ayah_id, server_updated_at }
 *   note:conflict   { ayah_id, server_note }
 */

const notesService = require('../modules/notes/notes.service');

module.exports = (io) => {
  io.on('connection', (socket) => {
    socket.on('note:push_diff', async ({ ayah_id, diff, client_updated_at }) => {
      if (!ayah_id || !diff) return;
      try {
        const existing = await notesService.getNoteByAyah(socket.user.id, ayah_id);
        if (existing) {
          // Conflict detection: if server is newer, emit conflict
          if (existing.updated_at > new Date(client_updated_at)) {
            socket.emit('note:conflict', { ayah_id, server_note: existing });
            return;
          }
          // Merge: apply diff as full note update (client is authoritative when newer)
          const updated = await notesService.updateNote(existing.id, socket.user.id, diff);
          socket.emit('note:ack', { ayah_id, server_updated_at: updated.updated_at });
        } else {
          const created = await notesService.createNote({ user_id: socket.user.id, ayah_id, note: diff });
          socket.emit('note:ack', { ayah_id, server_updated_at: created.created_at });
        }
      } catch (err) {
        socket.emit('note:error', { ayah_id, message: err.message });
      }
    });
  });
};
