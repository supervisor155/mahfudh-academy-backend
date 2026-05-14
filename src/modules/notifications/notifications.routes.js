const express = require('express');
const router  = express.Router();
const ctrl    = require('./notifications.controller');
const auth    = require('../../middlewares/auth');

router.use(auth);

router.get('/',               ctrl.getNotifications);
router.patch('/:id/read',     ctrl.markRead);
router.patch('/read-all',     ctrl.markAllRead);

module.exports = router;
