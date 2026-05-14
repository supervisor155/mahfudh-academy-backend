const express = require('express');
const router  = express.Router();
const ctrl    = require('./audit.controller');
const auth    = require('../../middlewares/auth');
const roles   = require('../../middlewares/roles');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

router.use(auth);

// Only owner and manager can view audit logs
router.get('/', roles('owner', 'manager'), requireFeatureForRoles('view_audit_logs', ['manager']), ctrl.getLogs);

module.exports = router;
