const auditService = require('./audit.service');

exports.getLogs = async (req, res) => {
  try {
    const { limit = 50, offset = 0, actor_id, target_table } = req.query;
    const logs = await auditService.getLogs({
      limit:        Number(limit),
      offset:       Number(offset),
      actor_id:     actor_id ? Number(actor_id) : undefined,
      target_table: target_table || undefined,
    });
    res.json({ data: logs, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
