const express = require('express');
const router  = express.Router();
const ctrl    = require('./attachments.controller');
const auth    = require('../../middlewares/auth');
const roles   = require('../../middlewares/roles');
const requireClassMember = require('../../middlewares/requireClassMember');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

router.use(auth);
router.use(requireClassMember);

router.post('/',      roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_content', ['manager']), ctrl.uploadAttachment);
router.get('/',       roles('owner', 'manager', 'teacher', 'student'), ctrl.getAttachments);
router.delete('/:id', roles('owner', 'manager', 'teacher'), requireFeatureForRoles('manage_content', ['manager']), ctrl.deleteAttachment);

module.exports = router;
