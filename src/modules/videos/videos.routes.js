const express = require('express');
const router = express.Router();
const ctrl = require('./videos.controller');
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');
const requireClassMember = require('../../middlewares/requireClassMember');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

router.use(auth);
router.use(requireClassMember);

router.post('/', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_content', ['manager']), ctrl.uploadVideo);
router.get('/', roles('owner', 'manager', 'teacher', 'student'), ctrl.getVideos);
router.get('/:id', roles('owner', 'manager', 'teacher', 'student'), ctrl.getVideo);
router.delete('/:id', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_content', ['manager']), ctrl.deleteVideo);
router.post('/:id/view',     roles('owner', 'manager', 'teacher', 'student'), ctrl.trackView);
router.patch('/:id/progress', roles('owner', 'manager', 'teacher', 'student'), ctrl.updateProgress);

module.exports = router;
