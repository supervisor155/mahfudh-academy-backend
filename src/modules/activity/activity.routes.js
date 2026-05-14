const express = require('express');
const router = express.Router();
const activityController = require('./activity.controller');
const authenticate = require('../../middlewares/auth');

// GET /api/activity
router.get('/', authenticate, activityController.getRecentActivity);

module.exports = router;
