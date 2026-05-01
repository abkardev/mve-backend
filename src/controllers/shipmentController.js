const Order = require('../models/Order');

/**
 * Seller updates shipment.
 * Triggers a real-time event to the buyer via Socket.io.
 *
 * POST /api/order/:orderId/shipment
 *   body: { carrier, trackingNumber, estimatedDelivery, status?, location?, note? }
 */
exports.updateShipment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { carrier, trackingNumber, estimatedDelivery, status, location, note } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });
    if (String(order.vendor) !== String(req.user._id)) {
      return res.status(403).json({ status: false, message: 'Not your order' });
    }

    if (!order.shippingDetails) order.shippingDetails = {};
    if (carrier) order.shippingDetails.carrier = carrier;
    if (trackingNumber) order.shippingDetails.trackingNumber = trackingNumber;
    if (estimatedDelivery) order.shippingDetails.estimatedDelivery = new Date(estimatedDelivery);

    // First time we get tracking info -> mark shipped
    if (carrier && trackingNumber && !order.shippingDetails.shippedAt) {
      order.shippingDetails.shippedAt = new Date();
      order.status = 'shipped';
    }
    if (status === 'delivered') {
      order.shippingDetails.deliveredAt = new Date();
      order.status = 'delivered';
    }

    // Append a tracking event to history
    if (!Array.isArray(order.trackingHistory)) order.trackingHistory = [];
    order.trackingHistory.push({
      status: status || (carrier ? 'shipped' : 'updated'),
      location,
      note,
      timestamp: new Date(),
    });

    await order.save();

    // Real-time notify buyer (assumes io is exposed via req.app.get('io'))
    const io = req.app.get('io');
    if (io) {
      io.to(`order:${order._id}`).emit('shipment:update', {
        orderId: order._id,
        status: order.status,
        shippingDetails: order.shippingDetails,
        latestEvent: order.trackingHistory[order.trackingHistory.length - 1],
      });
      io.to(`user:${order.buyer}`).emit('notification', {
        type: 'shipment_update',
        orderId: order._id,
        message: `Your order #${order.orderNumber} has been ${order.status.replace('_', ' ')}.`,
      });
    }

    res.json({ status: true, data: order });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// GET /api/order/:orderId/tracking  -> buyer-facing tracking view
exports.getTracking = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).select('orderNumber status shippingDetails trackingHistory buyer vendor createdAt');
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });

    const isParticipant =
      String(order.buyer) === String(req.user._id) ||
      String(order.vendor) === String(req.user._id) ||
      req.user.role === 'admin';
    if (!isParticipant) return res.status(403).json({ status: false, message: 'Forbidden' });

    res.json({ status: true, data: order });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};
