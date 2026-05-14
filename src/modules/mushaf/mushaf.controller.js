const svc = require('./mushaf.service');

// ─── Bookmarks ────────────────────────────────────────────────────────────

exports.getBookmarks = async (req, res) => {
  try {
    const bookmarks = await svc.getBookmarks(req.user.id);
    res.json({ data: bookmarks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addBookmark = async (req, res) => {
  try {
    const { ayah_id, label } = req.body;
    if (!ayah_id) return res.status(400).json({ message: 'ayah_id is required' });
    const bookmark = await svc.addBookmark(req.user.id, ayah_id, label);
    res.status(201).json(bookmark);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.removeBookmark = async (req, res) => {
  try {
    const { ayah_id } = req.body;
    if (!ayah_id) return res.status(400).json({ message: 'ayah_id is required' });
    await svc.removeBookmark(req.user.id, ayah_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Reading Progress ─────────────────────────────────────────────────────

exports.getProgress = async (req, res) => {
  try {
    const progress = await svc.getProgress(req.user.id);
    res.json({ data: progress });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.upsertProgress = async (req, res) => {
  try {
    const { surah_id, last_ayah, total_ayahs } = req.body;
    if (!surah_id || !last_ayah) return res.status(400).json({ message: 'surah_id and last_ayah are required' });
    const row = await svc.upsertProgress(req.user.id, surah_id, last_ayah, total_ayahs || 1);
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
