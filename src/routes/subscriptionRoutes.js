const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscriptionController');
const auth = require('../middleware/auth'); // assumes existing auth middleware
const adminOnly = require('../middleware/adminOnly');

// Vendor routes
router.get('/subscription/me', auth, ctrl.getMine);
router.post('/subscription/checkout', auth, ctrl.createCheckout);
router.post('/subscription/cancel', auth, ctrl.cancel);
router.post('/subscription/change-plan', auth, ctrl.changePlan);

// Admin routes
router.get('/admin/subscriptions', auth, adminOnly, ctrl.adminList);
router.post('/admin/subscriptions/assign', auth, adminOnly, ctrl.adminAssign);
router.get('/admin/subscriptions/analytics', auth, adminOnly, ctrl.adminAnalytics);

module.exports = router;
