const express = require('express');
const router = express.Router();
const ctrl = require('./classes.controller');
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

// All routes require authentication
router.use(auth);

router.post('/', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.createClass);
router.get('/', roles('owner', 'manager', 'teacher', 'student'), ctrl.getClasses);
router.get('/:id', roles('owner', 'manager', 'teacher', 'student'), ctrl.getClass);
router.patch('/:id/privacy', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.setClassPrivacy);
router.patch('/:id', roles('owner', 'manager'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.updateClass);
router.delete('/:id', roles('owner', 'manager'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.deleteClass);

// Join via invite code
router.post('/join', roles('student', 'teacher'), ctrl.joinByCode);

// Members
router.get('/:id/members', roles('owner', 'manager', 'teacher', 'student'), ctrl.getMembers);
router.post('/:id/members', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.addMember);
router.delete('/:id/members/:userId', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.removeMember);
router.post('/:id/regenerate-code', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.regenerateCode);

// Access requests (join requests from non-members)
router.post('/:id/request-access', roles('student', 'teacher'), ctrl.requestAccess);
router.get('/:id/access-requests', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.getAccessRequests);
router.post('/:id/access-requests/:requestId/approve', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.approveAccessRequest);
router.post('/:id/access-requests/:requestId/decline', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_classes', ['manager']), ctrl.declineAccessRequest);

// Class chat history
router.get('/:id/chat/messages', roles('owner', 'manager', 'teacher', 'student'), ctrl.getChatMessages);

module.exports = router;
