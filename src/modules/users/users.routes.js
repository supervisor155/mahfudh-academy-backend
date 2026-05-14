const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');
const usersController = require('./users.controller');

router.use(auth);
router.use(roles('owner', 'manager', 'teacher', 'student'));

router.get('/search', usersController.searchUsers);

module.exports = router;
