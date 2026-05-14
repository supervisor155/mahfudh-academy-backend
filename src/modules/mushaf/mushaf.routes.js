const express = require('express');
const router = express.Router();
const ctrl = require('./mushaf.controller');
const auth = require('../../middlewares/auth');

router.use(auth);

// Bookmarks — all authenticated users
router.get('/bookmarks',    ctrl.getBookmarks);
router.post('/bookmarks',   ctrl.addBookmark);
router.delete('/bookmarks', ctrl.removeBookmark);

// Reading progress — all authenticated users
router.get('/progress',     ctrl.getProgress);
router.post('/progress',    ctrl.upsertProgress);

module.exports = router;
