const usersService = require('./users.service');

exports.searchUsers = async (req, res) => {
  try {
    const users = await usersService.searchUsers({
      query: req.query.q,
      requesterId: req.user.id,
      limit: req.query.limit,
    });

    return res.json({ data: users });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
