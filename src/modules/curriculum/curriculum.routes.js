const express = require('express');
const router  = express.Router();
const ctrl    = require('./curriculum.controller');
const auth    = require('../../middlewares/auth');
const roles   = require('../../middlewares/roles');
const requireClassMember = require('../../middlewares/requireClassMember');

router.use(auth);
router.use(requireClassMember);

router.post('/',       roles('owner', 'manager', 'teacher'), ctrl.createModule);
router.get('/',        roles('owner', 'manager', 'teacher', 'student'), ctrl.getModules);
router.patch('/:id',   roles('owner', 'manager', 'teacher'), ctrl.updateModule);
router.delete('/:id',  roles('owner', 'manager'), ctrl.deleteModule);

module.exports = router;
