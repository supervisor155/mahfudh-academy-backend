const express = require('express');
const router = express.Router();
const ctrl = require('./reels.controller');
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');
const requireClassMember = require('../../middlewares/requireClassMember');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

// All routes require authentication
router.use(auth);

// Global feed — no class membership required (public classes + enrolled private)
router.get('/feed', roles('owner', 'manager', 'teacher', 'student'), ctrl.getFeed);

// Like / unlike — no class membership required (feed reels can be liked)
router.post('/:id/like',   roles('owner', 'manager', 'teacher', 'student'), ctrl.likeReel);
router.delete('/:id/like', roles('owner', 'manager', 'teacher', 'student'), ctrl.unlikeReel);

// Class-scoped routes — require membership
router.use(requireClassMember);

router.post('/',          roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_content', ['manager']), ctrl.uploadReel);
router.get('/',           roles('owner', 'manager', 'teacher', 'student'), ctrl.getReels);
router.get('/:id',        roles('owner', 'manager', 'teacher', 'student'), ctrl.getReel);
router.delete('/:id',     roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_content', ['manager']), ctrl.deleteReel);
router.post('/:id/view',  roles('owner', 'manager', 'teacher', 'student'), ctrl.trackView);

module.exports = router;
