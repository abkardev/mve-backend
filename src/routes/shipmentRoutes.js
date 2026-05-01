const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { updateShipment, getTracking } = require('../controllers/shipmentController');

router.post('/order/:orderId/shipment', auth, updateShipment);
router.get('/order/:orderId/tracking', auth, getTracking);

module.exports = router;
