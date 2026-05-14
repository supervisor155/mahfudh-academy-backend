const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');
const dmController = require('./dm.controller');

router.use(auth);
router.use(roles('owner', 'manager', 'teacher', 'student'));

router.get('/conversations', dmController.getRecentConversations);
router.get('/:userId', dmController.getConversation);
router.post('/:userId', dmController.sendMessage);

module.exports = router;
