const express = require('express');
const router = express.Router();
const ctrl = require('./quran.controller');
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');

router.use(auth);
router.use(roles('owner', 'manager', 'teacher', 'student'));

router.get('/surahs', ctrl.getSurahs);
router.get('/surahs/:surahNumber', ctrl.getSurahByNumber);
router.get('/pages/:pageNumber', ctrl.getPageByNumber);
router.get('/audio/ayah/:surahNumber/:ayahNumber', ctrl.getAyahAudio);

module.exports = router;