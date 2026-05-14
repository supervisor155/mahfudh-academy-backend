const dmService = require('./dm.service');

exports.getConversation = async (req, res) => {
  try {
    const peerId = Number(req.params.userId);
    if (!peerId || peerId === req.user.id) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const messages = await dmService.getConversation(req.user.id, peerId, req.query.limit);
    await dmService.markConversationRead(req.user.id, peerId);

    return res.json({ data: messages });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const peerId = Number(req.params.userId);
    const text = String(req.body?.message || '').trim();

    if (!peerId || peerId === req.user.id) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (!text) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const saved = await dmService.createMessage(req.user.id, peerId, text);
    return res.status(201).json({ data: saved });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getRecentConversations = async (req, res) => {
  try {
    const conversations = await dmService.getRecentConversations(req.user.id, req.query.limit);
    return res.json({ data: conversations });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
