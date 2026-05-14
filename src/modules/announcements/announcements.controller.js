const svc = require('./announcements.service');

exports.create = async (req, res) => {
  try {
    const { class_id, title, body, pinned } = req.body;
    if (!class_id || !title || !body) return res.status(400).json({ message: 'class_id, title, and body required' });
    const a = await svc.create({ class_id, created_by: req.user.id, title, body, pinned });
    res.status(201).json(a);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });
    const data = await svc.getByClass(class_id);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { title, body, pinned } = req.body;
    const updated = await svc.update(req.params.id, { title, body, pinned });
    if (!updated) return res.status(404).json({ message: 'Announcement not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const a = await svc.getById(req.params.id);
    if (!a) return res.status(404).json({ message: 'Announcement not found' });
    await svc.remove(req.params.id);
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
