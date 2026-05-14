const express = require('express');
const router  = express.Router();
const ctrl    = require('./assignments.controller');
const auth    = require('../../middlewares/auth');
const roles   = require('../../middlewares/roles');
const requireClassMember = require('../../middlewares/requireClassMember');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

router.use(auth);
router.use(requireClassMember);

router.post('/',                   roles('owner', 'manager', 'teacher'),             requireFeatureForRoles('manage_content', ['manager']), ctrl.create);
router.get('/',                    roles('owner', 'manager', 'teacher', 'student'),  ctrl.list);
router.get('/:id',                 roles('owner', 'manager', 'teacher', 'student'),  ctrl.getOne);
router.delete('/:id',              roles('owner', 'manager', 'teacher'),             requireFeatureForRoles('manage_content', ['manager']), ctrl.remove);
router.post('/:id/submit',         roles('owner', 'manager', 'teacher', 'student'), ctrl.submit);
router.get('/:id/submissions',     roles('owner', 'manager', 'teacher'),             requireFeatureForRoles('manage_content', ['manager']), ctrl.getSubmissions);
router.get('/:id/my-submission',   roles('owner', 'manager', 'teacher', 'student'), ctrl.getMySubmission);
router.patch('/:id/grade',         roles('owner', 'manager', 'teacher'),             requireFeatureForRoles('manage_content', ['manager']), ctrl.grade);

module.exports = router;
