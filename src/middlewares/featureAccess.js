const db = require('../db');

function requireFeatureForRoles(featureKey, rolesToCheck = ['manager']) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      if (req.user.role === 'owner') return next();
      if (!rolesToCheck.includes(req.user.role)) return next();

      const { rows } = await db.query(
        `SELECT can_access
         FROM user_feature_permissions
         WHERE user_id = $1 AND feature_key = $2
         LIMIT 1`,
        [req.user.id, featureKey]
      );

      if (!rows[0] || rows[0].can_access !== true) {
        return res.status(403).json({
          message: `Forbidden: missing required feature permission (${featureKey})`,
        });
      }

      return next();
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  };
}

module.exports = {
  requireFeatureForRoles,
};
