const notificationsService = require('./notifications.service');

exports.getNotifications = async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const data  = await notificationsService.getNotifications(req.user.id, Number(limit), Number(offset));
    const unread = await notificationsService.getUnreadCount(req.user.id);
    res.json({ data, unread, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    const notification = await notificationsService.markRead(req.params.id, req.user.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await notificationsService.markAllRead(req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
