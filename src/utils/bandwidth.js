/**
 * Low-Bandwidth Resilience Strategy
 * Targeted for 70% Packet Loss / <100kbps connections.
 */

const presence = new Map(); // user_id -> { kbps, latency, thermal_throttled }

exports.bandwidthHandler = (io, socket) => {
  // 1. Bitrate Probing: Receive health reports from client
  socket.on('network:telemetry', ({ kbps, latency, packetLoss }) => {
    presence.set(socket.user.id, { kbps, latency, packetLoss });

    // 2. Congestion Control: Adaptive Payload Decision
    if (kbps < 100 || packetLoss > 0.5) {
      // Force "Survival Mode" for this client
      socket.emit('network:adaptation', {
        mode: 'audio-only-fallback',
        syncInterval: 5000, // slower sync to save bandwidth
        resolutionLimit: '144p',
        fecEnabled: true
      });
      
      // Notify the teacher that this student has a critical connection
      _notifyTeacherOfStudentStruggle(io, socket);
    }
  });

  socket.on('disconnect', () => presence.delete(socket.user.id));
};

function _notifyTeacherOfStudentStruggle(io, socket) {
  // Logic to find the class_id the student is in and notify the teacher
  // socket.to(`class:${class_id}`).emit('student:lagging', { user_id: socket.user.id });
}

/**
 * Payload Minimization: Differential Sync Utility
 * Used for Note Syncing (Ayah-based)
 */
exports.calculateDiff = (oldNote, newNote) => {
  // In a real scenario, use a library like 'fast-json-patch'
  // Here we represent the logic of sending only what changed.
  if (JSON.stringify(oldNote) === JSON.stringify(newNote)) return null;
  return newNote; // Simplification: in prod, use json-diff
};
