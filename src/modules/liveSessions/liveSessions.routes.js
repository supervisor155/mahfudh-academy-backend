const express = require('express');
const router = express.Router();
const ctrl = require('./liveSessions.controller');
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');
const requireClassMember = require('../../middlewares/requireClassMember');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

router.use(auth);
router.use(requireClassMember);

router.post('/', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_live_sessions', ['manager']), ctrl.createSession);
router.get('/', roles('owner', 'manager', 'teacher', 'student'), ctrl.getSessions);
router.get('/:id', roles('owner', 'manager', 'teacher', 'student'), ctrl.getSession);
router.patch('/:id/end', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_live_sessions', ['manager']), ctrl.endSession);
router.post('/:id/join', roles('owner', 'manager', 'teacher', 'student'), ctrl.joinSession);
router.post('/:id/leave', roles('owner', 'manager', 'teacher', 'student'), ctrl.leaveSession);
router.get('/:id/participants', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_live_sessions', ['manager']), ctrl.getParticipants);

module.exports = router;
