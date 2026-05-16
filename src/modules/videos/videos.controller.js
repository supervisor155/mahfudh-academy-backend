const videosService = require('./videos.service');
const classesService = require('../classes/classes.service');
const { upload, getPublicUrl } = require('../../utils/storage');

exports.uploadVideo = [
  upload.single('file'),
  async (req, res) => {
    try {
      const { class_id, title, url: bodyUrl } = req.body;
      if (!class_id || !title) return res.status(400).json({ message: 'class_id and title required' });
      let url = bodyUrl;
      if (req.file) url = getPublicUrl(req.file.filename, req);
      if (!url) return res.status(400).json({ message: 'Provide a video file or a url' });
      const cls = await classesService.getClassById(class_id);
      if (!cls) return res.status(404).json({ message: 'Class not found' });
      const video = await videosService.uploadVideo({ class_id, title, url, uploaded_by: req.user.id });
      res.status(201).json(video);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
];

exports.getVideos = async (req, res) => {
  try {
    const { class_id, limit = 20, offset = 0 } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });
    const videos = await videosService.getVideosByClass(class_id, Number(limit), Number(offset));
    res.json({ data: videos, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getVideo = async (req, res) => {
  try {
    const video = await videosService.getVideoById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.json(video);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteVideo = async (req, res) => {
  try {
    await videosService.deleteVideo(req.params.id);
    res.json({ message: 'Video deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.trackView = async (req, res) => {
  try {
    await videosService.trackView(req.params.id, req.user.id);
    const count = await videosService.getViewCount(req.params.id);
    res.json({ views: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProgress = async (req, res) => {
  try {
    const { progress_percentage } = req.body;
    if (progress_percentage === undefined) return res.status(400).json({ message: 'progress_percentage required' });
    const result = await videosService.updateProgress(req.params.id, req.user.id, progress_percentage);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
