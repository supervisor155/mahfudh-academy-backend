const reelsService = require('./reels.service');
const classesService = require('../classes/classes.service');
const { upload, getPublicUrl } = require('../../utils/storage');

exports.uploadReel = [
  upload.single('file'),
  async (req, res) => {
    try {
      const { class_id, title, url: bodyUrl } = req.body;
      if (!class_id) return res.status(400).json({ message: 'class_id required' });
      let url = bodyUrl;
      if (req.file) url = getPublicUrl(req.file.filename, req);
      if (!url) return res.status(400).json({ message: 'Provide a video file or a url' });
      const cls = await classesService.getClassById(class_id);
      if (!cls) return res.status(404).json({ message: 'Class not found' });
      const reel = await reelsService.uploadReel({ class_id, title, url, uploaded_by: req.user.id });
      res.status(201).json(reel);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
];

exports.getReels = async (req, res) => {
  try {
    const { class_id, limit = 20, offset = 0 } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });
    const reels = await reelsService.getReelsByClass(class_id, Number(limit), Number(offset));
    res.json({ data: reels, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** GET /api/reels/feed — global feed, no class membership required */
exports.getFeed = async (req, res) => {
  try {
    const { limit = 15, offset = 0 } = req.query;
    const reels = await reelsService.getGlobalFeed(req.user.id, Number(limit), Number(offset));
    res.json({ data: reels, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getReel = async (req, res) => {
  try {
    const reel = await reelsService.getReelById(req.params.id);
    if (!reel) return res.status(404).json({ message: 'Reel not found' });
    res.json(reel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteReel = async (req, res) => {
  try {
    await reelsService.deleteReel(req.params.id);
    res.json({ message: 'Reel deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.trackView = async (req, res) => {
  try {
    const { timestamp_seconds } = req.body;
    await reelsService.trackView(req.params.id, req.user.id, timestamp_seconds);
    const count = await reelsService.getViewCount(req.params.id);
    res.json({ views: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.likeReel = async (req, res) => {
  try {
    const count = await reelsService.likeReel(req.params.id, req.user.id);
    res.json({ likes: count, liked: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.unlikeReel = async (req, res) => {
  try {
    const count = await reelsService.unlikeReel(req.params.id, req.user.id);
    res.json({ likes: count, liked: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
