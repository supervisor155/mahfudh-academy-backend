const curriculumService = require('./curriculum.service');
const classesService    = require('../classes/classes.service');

exports.createModule = async (req, res) => {
  try {
    const { class_id, title, sort_order } = req.body;
    if (!class_id || !title) return res.status(400).json({ message: 'class_id and title required' });
    const cls = await classesService.getClassById(class_id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    const mod = await curriculumService.createModule({ class_id, title, sort_order });
    res.status(201).json(mod);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getModules = async (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id required' });
    const modules = await curriculumService.getModulesByClass(class_id);
    res.json({ data: modules });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateModule = async (req, res) => {
  try {
    const { title, sort_order } = req.body;
    const updated = await curriculumService.updateModule(req.params.id, { title, sort_order });
    if (!updated) return res.status(404).json({ message: 'Module not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteModule = async (req, res) => {
  try {
    const mod = await curriculumService.getModuleById(req.params.id);
    if (!mod) return res.status(404).json({ message: 'Module not found' });
    await curriculumService.deleteModule(req.params.id);
    res.json({ message: 'Module deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
