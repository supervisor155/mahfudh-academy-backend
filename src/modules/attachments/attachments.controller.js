const attachmentsService = require('./attachments.service');
const { upload, getPublicUrl, deleteFile, uploadToSupabase, USE_SUPABASE } = require('../../utils/storage');

// POST /api/attachments  (multipart/form-data: file + class_id)
exports.uploadAttachment = [
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
      const { class_id } = req.body;
      if (!class_id) return res.status(400).json({ message: 'class_id required' });

      let filename = req.file.filename;
      let url;

      if (USE_SUPABASE) {
        // Upload to Supabase Storage
        filename = await uploadToSupabase(req.file);
        url = getPublicUrl(filename, req);
      } else {
        // Local disk storage
        url = getPublicUrl(req.file.filename, req);
      }

      const attachment = await attachmentsService.createAttachment({
        class_id,
        uploaded_by: req.user.id,
        filename,
        url,
        mime_type:   req.file.mimetype,
        size_bytes:  req.file.size,
      });
      res.status(201).json(attachment);
    } catch (err) {
      console.error('❌ Attachment upload error:', err);
      res.status(500).json({ message: err.message });
    }
  },
];

exports.getAttachments = async (req, res) => {
  try {
    const { class_id, limit = 20, offset = 0 } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });
    const data = await attachmentsService.getAttachmentsByClass(class_id, Number(limit), Number(offset));
    res.json({ data, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteAttachment = async (req, res) => {
  try {
    const attachment = await attachmentsService.getAttachmentById(req.params.id);
    if (!attachment) return res.status(404).json({ message: 'Attachment not found' });
    await attachmentsService.deleteAttachment(req.params.id);
    deleteFile(attachment.filename); // remove from local disk (or Supabase when migrated)
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
