const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/escrowController');
const { auth, adminOnly } = require('../middleware/auth'); // your existing auth middleware
const multer = require('multer');

// Configure multer for file uploads (adjust storage as needed)
const upload = multer({ dest: 'uploads/disputes/' });

// ─── Orders ──────────────────────────────────────────────
router.get('/order', auth, ctrl.getOrders);
router.get('/order/my/:role', auth, ctrl.getMyOrders);
router.get('/order/:id', auth, ctrl.getOrderById);

// ─── Payments ────────────────────────────────────────────
router.post('/payment/create', auth, ctrl.createPayment);
router.get('/payment/order/:orderId', auth, ctrl.getPaymentByOrder);

// ─── Escrow Actions ──────────────────────────────────────
router.post('/escrow/confirm-delivery', auth, ctrl.confirmDelivery);
router.post('/escrow/release-funds', auth, adminOnly, ctrl.releaseFunds);
router.post('/escrow/update-shipping', auth, ctrl.updateShipping);

// ─── Wallet ──────────────────────────────────────────────
router.get('/wallet/me', auth, ctrl.getMyWallet);
router.get('/wallet/transactions', auth, ctrl.getTransactions);
router.post('/wallet/withdraw', auth, ctrl.withdraw);
router.get('/wallet/withdrawals', auth, ctrl.getWithdrawals);

// ─── Disputes ────────────────────────────────────────────
router.post('/dispute/open', auth, upload.array('evidence', 5), ctrl.openDispute);
router.get('/dispute', auth, adminOnly, ctrl.getAllDisputes);
router.get('/dispute/my', auth, ctrl.getMyDisputes);
router.get('/dispute/:id', auth, ctrl.getDispute);
router.post('/dispute/resolve', auth, adminOnly, ctrl.resolveDispute);
router.post('/dispute/:disputeId/evidence', auth, upload.array('evidence', 5), ctrl.addEvidence);

module.exports = router;
