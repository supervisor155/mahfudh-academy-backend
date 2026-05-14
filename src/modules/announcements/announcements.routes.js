const express = require('express');
const router  = express.Router();
const ctrl    = require('./announcements.controller');
const auth    = require('../../middlewares/auth');
const roles   = require('../../middlewares/roles');
const requireClassMember = require('../../middlewares/requireClassMember');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

router.use(auth);
router.use(requireClassMember);

router.post('/',     roles('owner', 'manager', 'teacher'),            requireFeatureForRoles('manage_content', ['manager']), ctrl.create);
router.get('/',      roles('owner', 'manager', 'teacher', 'student'), ctrl.list);
router.patch('/:id', roles('owner', 'manager', 'teacher'),            requireFeatureForRoles('manage_content', ['manager']), ctrl.update);
router.delete('/:id',roles('owner', 'manager', 'teacher'),            requireFeatureForRoles('manage_content', ['manager']), ctrl.remove);

module.exports = router;
