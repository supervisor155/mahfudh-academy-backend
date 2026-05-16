const svc = require('./assignments.service');
const { upload, getPublicUrl } = require('../../utils/storage');

exports.create = async (req, res) => {
  try {
    const { class_id, title, description, due_date, max_points } = req.body;
    if (!class_id || !title) return res.status(400).json({ message: 'class_id and title required' });
    const a = await svc.createAssignment({ class_id, created_by: req.user.id, title, description, due_date, max_points });
    res.status(201).json(a);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });
    const data = await svc.getAssignmentsByClass(class_id);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const a = await svc.getAssignmentById(req.params.id);
    if (!a) return res.status(404).json({ message: 'Assignment not found' });
    res.json(a);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await svc.deleteAssignment(req.params.id);
    res.json({ message: 'Assignment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.submit = [
  upload.single('file'),
  async (req, res) => {
    try {
      const { assignment_id, content } = req.body;
      if (!assignment_id) return res.status(400).json({ message: 'assignment_id required' });
      let file_url = null, filename = null;
      if (req.file) {
        file_url = getPublicUrl(req.file.filename, req);
        filename = req.file.filename;
      }
      if (!content && !file_url) return res.status(400).json({ message: 'Provide content text or a file' });
      const s = await svc.submitAssignment({ assignment_id, student_id: req.user.id, content, file_url, filename });
      res.status(201).json(s);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
];

exports.getSubmissions = async (req, res) => {
  try {
    const data = await svc.getSubmissions(req.params.id);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMySubmission = async (req, res) => {
  try {
    const s = await svc.getMySubmission(req.params.id, req.user.id);
    res.json(s || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.grade = async (req, res) => {
  try {
    const { student_id, grade, feedback } = req.body;
    if (!student_id || grade === undefined) return res.status(400).json({ message: 'student_id and grade required' });
    const s = await svc.gradeSubmission(req.params.id, student_id, { grade, feedback });
    if (!s) return res.status(404).json({ message: 'Submission not found' });
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
