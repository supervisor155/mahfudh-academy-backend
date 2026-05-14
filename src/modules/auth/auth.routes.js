const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const auth = require('../../middlewares/auth');
const roles = require('../../middlewares/roles');
const { requireFeatureForRoles } = require('../../middlewares/featureAccess');

router.post('/register', authController.register);
router.post('/register/request-otp', authController.requestRegistrationOtp);
router.post('/register/verify-otp', authController.verifyRegistrationOtp);
router.post('/google', authController.googleAuth);
router.post('/login', authController.login);
router.post('/login/request-otp', authController.requestLoginOtp);
router.post('/login/verify-otp', authController.verifyLoginOtp);
router.post('/refresh', authController.refreshSession);
router.post('/logout', authController.logout);
router.get('/csrf-token', authController.getCsrfToken);

// Admin endpoints
router.get('/users', auth, roles('owner', 'manager'), requireFeatureForRoles('manage_users', ['manager']), authController.listUsers);
router.get('/stats', auth, roles('owner', 'manager'), requireFeatureForRoles('platform_settings', ['manager']), authController.getPlatformStats);
router.get('/security/status', auth, roles('owner', 'manager'), requireFeatureForRoles('platform_settings', ['manager']), authController.getSecurityStatus);
router.get('/security/tickets', auth, roles('owner'), authController.getSecurityTickets);
router.patch('/security/tickets/:ticketId', auth, roles('owner'), authController.updateSecurityTicketStatus);

// Owner governance endpoints
router.patch('/users/:userId/role', auth, roles('owner'), authController.updateUserRole);
router.delete('/users/:userId', auth, roles('owner'), authController.deleteUser);
router.get('/users/:userId/features', auth, roles('owner'), authController.getUserFeatures);
router.put('/users/:userId/features', auth, roles('owner'), authController.updateUserFeatures);
router.get('/features/catalog', auth, roles('owner'), authController.listFeatureCatalog);
router.post('/system/wipe/prepare', auth, roles('owner'), authController.prepareWipePlatform);
router.post('/system/wipe', auth, roles('owner'), authController.wipePlatform);
router.get('/owner/actions', auth, roles('owner'), authController.getOwnerActions);
router.get('/owner/actions/export', auth, roles('owner'), authController.exportOwnerActionsCsv);

module.exports = router;
