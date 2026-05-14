const express = require('express');
const router = express.Router();
const ctrl = require('./notes.controller');
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');

router.use(auth);

// ── Core CRUD ─────────────────────────────────────────────────────────────
router.post('/',                    roles('owner', 'manager', 'teacher', 'student'), ctrl.createNote);
router.get('/',                     roles('owner', 'manager', 'teacher', 'student'), ctrl.getNotes);
router.patch('/:id',                roles('owner', 'manager', 'teacher', 'student'), ctrl.updateNote);
router.delete('/:id',               roles('owner', 'manager', 'teacher', 'student'), ctrl.deleteNote);

// ── Queries ───────────────────────────────────────────────────────────────
router.get('/sync',                 roles('owner', 'manager', 'teacher', 'student'), ctrl.syncNotes);
router.get('/search',               roles('owner', 'manager', 'teacher', 'student'), ctrl.searchNotes);
router.get('/ayah/:ayahId',         roles('owner', 'manager', 'teacher', 'student'), ctrl.getNoteByAyah);
router.get('/surah/:surahId',       roles('owner', 'manager', 'teacher', 'student'), ctrl.getNotesBySurah);

// ── Pin / Archive ─────────────────────────────────────────────────────────
router.post('/:id/pin',             roles('owner', 'manager', 'teacher', 'student'), ctrl.togglePin);
router.post('/:id/archive',         roles('owner', 'manager', 'teacher', 'student'), ctrl.toggleArchive);

// ── Sharing ───────────────────────────────────────────────────────────────
router.post('/:id/share',           roles('owner', 'manager', 'teacher', 'student'), ctrl.shareNote);
router.post('/:id/unshare',         roles('owner', 'manager', 'teacher', 'student'), ctrl.unshareNote);
router.get('/class/:classId/shared',roles('owner', 'manager', 'teacher', 'student'), ctrl.getSharedNotesByClass);

// ── Teacher Feedback ──────────────────────────────────────────────────────
router.post('/:id/feedback',        roles('owner', 'manager', 'teacher'),            ctrl.addFeedback);
router.get('/:id/feedback',         roles('owner', 'manager', 'teacher', 'student'), ctrl.getFeedback);

module.exports = router;
