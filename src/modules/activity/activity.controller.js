const activityService = require('./activity.service');

// GET /api/activity
exports.getRecentActivity = async (req, res) => {
  try {
    // For now, use user id from req.user (assume auth middleware)
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const activity = await activityService.getRecentActivity(userId);
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
