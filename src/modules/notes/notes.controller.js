const svc = require('./notes.service');

// ─── Create ────────────────────────────────────────────────────────────────

exports.createNote = async (req, res) => {
  try {
    const { ayah_id, note, type, tags, color, page_ref, word_range } = req.body;
    if (!ayah_id || !note) return res.status(400).json({ message: 'ayah_id and note are required' });

    const created = await svc.createNote({
      user_id: req.user.id, ayah_id, note, type, tags, color, page_ref, word_range,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Read ──────────────────────────────────────────────────────────────────

exports.getNotes = async (req, res) => {
  try {
    const { limit, offset, type, tags, surah_id, is_pinned, is_archived } = req.query;
    const notes = await svc.getNotesByUser(req.user.id, {
      limit, offset, type,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
      surah_id, is_pinned,
      is_archived: is_archived === 'true',
    });
    res.json({ data: notes, count: notes.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getNoteByAyah = async (req, res) => {
  try {
    const notes = await svc.getNoteByAyah(req.user.id, req.params.ayahId);
    res.json({ data: notes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getNotesBySurah = async (req, res) => {
  try {
    const notes = await svc.getNotesBySurah(req.user.id, req.params.surahId);
    res.json({ data: notes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.searchNotes = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ message: 'Query must be at least 2 characters' });
    const notes = await svc.searchNotes(req.user.id, q.trim());
    res.json({ data: notes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Update ────────────────────────────────────────────────────────────────

exports.updateNote = async (req, res) => {
  try {
    const { note, type, tags, color, page_ref, word_range } = req.body;
    const updated = await svc.updateNote(req.params.id, req.user.id, { note, type, tags, color, page_ref, word_range });
    if (!updated) return res.status(404).json({ message: 'Note not found or unauthorized' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.togglePin = async (req, res) => {
  try {
    const result = await svc.togglePin(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ message: 'Note not found' });
    res.json({ id: result.id, is_pinned: result.is_pinned });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.toggleArchive = async (req, res) => {
  try {
    const result = await svc.toggleArchive(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ message: 'Note not found' });
    res.json({ id: result.id, is_archived: result.is_archived });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Delete ────────────────────────────────────────────────────────────────

exports.deleteNote = async (req, res) => {
  try {
    const deleted = await svc.softDeleteNote(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ message: 'Note not found or unauthorized' });
    res.json({ message: 'Note deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Sharing ───────────────────────────────────────────────────────────────

exports.shareNote = async (req, res) => {
  try {
    const { class_id } = req.body;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });
    const result = await svc.shareNote(req.params.id, req.user.id, class_id);
    if (!result) return res.status(403).json({ message: 'Not a member of that class or note not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.unshareNote = async (req, res) => {
  try {
    const result = await svc.unshareNote(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ message: 'Note not found' });
    res.json({ message: 'Note unshared', id: result.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSharedNotesByClass = async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const notes = await svc.getSharedNotesByClass(req.params.classId, limit, offset);
    res.json({ data: notes, count: notes.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Teacher Feedback ──────────────────────────────────────────────────────

exports.addFeedback = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ message: 'comment required' });
    const fb = await svc.addFeedback(req.params.id, req.user.id, comment);
    res.status(201).json(fb);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getFeedback = async (req, res) => {
  try {
    const fb = await svc.getFeedback(req.params.id);
    res.json({ data: fb });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Offline-first Delta Sync ──────────────────────────────────────────────

exports.syncNotes = async (req, res) => {
  try {
    const { since } = req.query;
    if (!since) return res.status(400).json({ message: 'since timestamp required' });
    const notes = await svc.getNotesSince(req.user.id, since);
    res.json({ data: notes, synced_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
