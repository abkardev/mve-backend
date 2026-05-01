const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Dispute = require('../models/Dispute');

// Helper: get or create wallet
const getOrCreateWallet = async (userId, currency = 'USD') => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await Wallet.create({ user: userId, currency });
  }
  return wallet;
};

// Helper: log transaction
const logTransaction = async ({ wallet, user, type, amount, currency, reference, description }) => {
  const balance = type === 'escrow_hold'
    ? wallet.pendingBalance
    : wallet.availableBalance;
  
  return Transaction.create({
    wallet: wallet._id,
    user,
    type,
    amount,
    currency,
    balance,
    reference,
    description,
  });
};

// ─── PAYMENT ─────────────────────────────────────────────

exports.createPayment = async (req, res) => {
  try {
    const { orderId, method, currency } = req.body;
    const buyerId = req.user._id;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });
    if (order.buyer.toString() !== buyerId.toString()) {
      return res.status(403).json({ status: false, message: 'Not your order' });
    }
    if (!['pending', 'awaiting_payment'].includes(order.status)) {
      return res.status(400).json({ status: false, message: 'Order cannot be paid in current status' });
    }

    // Check for duplicate payment
    const existingPayment = await Payment.findOne({ order: orderId, status: { $in: ['completed', 'processing'] } });
    if (existingPayment) {
      return res.status(400).json({ status: false, message: 'Payment already exists for this order' });
    }

    // Create payment record
    const payment = await Payment.create({
      order: orderId,
      buyer: buyerId,
      amount: order.totalAmount,
      currency: currency || order.currency,
      method,
      status: 'pending',
    });

    let checkoutUrl = null;

    // TODO: Integrate with Stripe / HyperPay
    // For now, simulate successful payment
    if (method === 'credit_card') {
      // Example Stripe integration:
      // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      // const session = await stripe.checkout.sessions.create({
      //   payment_method_types: ['card'],
      //   line_items: [{ price_data: { currency, product_data: { name: `Order ${order.orderNumber}` }, unit_amount: Math.round(order.totalAmount * 100) }, quantity: 1 }],
      //   mode: 'payment',
      //   success_url: `${process.env.FRONTEND_URL}/orders/${orderId}?payment=success`,
      //   cancel_url: `${process.env.FRONTEND_URL}/orders/${orderId}?payment=cancelled`,
      //   metadata: { orderId, paymentId: payment._id.toString() },
      // });
      // payment.gatewayRef = session.id;
      // checkoutUrl = session.url;

      // Simulated: mark as completed immediately
      payment.status = 'completed';
      payment.gatewayRef = `sim_${Date.now()}`;
    } else if (method === 'bank_transfer') {
      payment.status = 'processing'; // awaiting manual verification
    } else if (method === 'paypal') {
      payment.status = 'completed';
      payment.gatewayRef = `pp_sim_${Date.now()}`;
    }

    await payment.save();

    // If payment completed, move to escrow
    if (payment.status === 'completed') {
      order.status = 'in_escrow';
      order.paymentId = payment._id;
      order.paymentMethod = method;
      // Auto-release after 7 days from now (can be adjusted)
      order.autoReleaseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await order.save();

      // Credit seller's pending balance
      const vendorDoc = await require('../models/Vendor').findById(order.vendor);
      if (vendorDoc) {
        const sellerWallet = await getOrCreateWallet(vendorDoc.user, order.currency);
        sellerWallet.pendingBalance += order.totalAmount;
        await sellerWallet.save();

        await logTransaction({
          wallet: sellerWallet,
          user: vendorDoc.user,
          type: 'escrow_hold',
          amount: order.totalAmount,
          currency: order.currency,
          reference: order._id.toString(),
          description: `Escrow hold for order ${order.orderNumber}`,
        });
      }

      // TODO: Send notification to seller (email / in-app)
    }

    res.status(201).json({
      status: true,
      data: { payment, checkoutUrl },
      message: 'Payment created successfully',
    });
  } catch (error) {
    console.error('createPayment error:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

// ─── ESCROW ACTIONS ──────────────────────────────────────

exports.updateShipping = async (req, res) => {
  try {
    const { orderId, carrier, trackingNumber, estimatedDelivery } = req.body;

    const order = await Order.findById(orderId).populate('vendor');
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });

    // Verify seller owns this order
    const vendorDoc = await require('../models/Vendor').findOne({ user: req.user._id });
    if (!vendorDoc || order.vendor.toString() !== vendorDoc._id.toString()) {
      return res.status(403).json({ status: false, message: 'Not your order' });
    }
    if (order.status !== 'in_escrow') {
      return res.status(400).json({ status: false, message: 'Order must be in escrow to update shipping' });
    }

    order.shippingDetails = {
      carrier,
      trackingNumber,
      shippedAt: new Date(),
      estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : undefined,
    };
    order.status = 'shipped';
    await order.save();

    // TODO: Notify buyer about shipment

    res.json({ status: true, data: order });
  } catch (error) {
    console.error('updateShipping error:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.confirmDelivery = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });
    if (order.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: false, message: 'Not your order' });
    }
    if (!['shipped', 'in_escrow'].includes(order.status)) {
      return res.status(400).json({ status: false, message: 'Cannot confirm delivery in current status' });
    }

    order.status = 'delivered';
    if (order.shippingDetails) {
      order.shippingDetails.deliveredAt = new Date();
    }
    await order.save();

    // Release escrow funds
    await releaseFundsInternal(order);

    res.json({ status: true, data: order });
  } catch (error) {
    console.error('confirmDelivery error:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.releaseFunds = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });

    // Only admin can manually release
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: false, message: 'Admin only' });
    }

    await releaseFundsInternal(order);
    res.json({ status: true, data: order });
  } catch (error) {
    console.error('releaseFunds error:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

// Internal helper to release escrow
async function releaseFundsInternal(order) {
  const vendorDoc = await require('../models/Vendor').findById(order.vendor);
  if (!vendorDoc) throw new Error('Vendor not found');

  const sellerWallet = await getOrCreateWallet(vendorDoc.user, order.currency);

  // Move from pending to available
  sellerWallet.pendingBalance = Math.max(0, sellerWallet.pendingBalance - order.totalAmount);
  sellerWallet.availableBalance += order.totalAmount;
  await sellerWallet.save();

  await logTransaction({
    wallet: sellerWallet,
    user: vendorDoc.user,
    type: 'escrow_release',
    amount: order.totalAmount,
    currency: order.currency,
    reference: order._id.toString(),
    description: `Escrow released for order ${order.orderNumber}`,
  });

  order.status = 'completed';
  order.escrowReleasedAt = new Date();
  await order.save();

  // TODO: Notify seller that funds are available
}

// ─── WALLET ──────────────────────────────────────────────

exports.getMyWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    res.json({ status: true, data: wallet });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Transaction.countDocuments({ user: req.user._id }),
    ]);

    res.json({
      status: true,
      data: transactions,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.withdraw = async (req, res) => {
  try {
    const { amount, currency, bankDetails } = req.body;

    const wallet = await getOrCreateWallet(req.user._id);
    if (wallet.availableBalance < amount) {
      return res.status(400).json({ status: false, message: 'Insufficient balance' });
    }

    const WithdrawalRequest = require('../models/WithdrawalRequest');
    const withdrawal = await WithdrawalRequest.create({
      user: req.user._id,
      amount,
      currency: currency || wallet.currency,
      bankDetails,
    });

    // Deduct from available balance
    wallet.availableBalance -= amount;
    await wallet.save();

    await logTransaction({
      wallet,
      user: req.user._id,
      type: 'withdrawal',
      amount: -amount,
      currency: wallet.currency,
      reference: withdrawal._id.toString(),
      description: `Withdrawal request of ${amount} ${wallet.currency}`,
    });

    res.status(201).json({ status: true, data: withdrawal });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.getWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const WithdrawalRequest = require('../models/WithdrawalRequest');

    const [withdrawals, total] = await Promise.all([
      WithdrawalRequest.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      WithdrawalRequest.countDocuments({ user: req.user._id }),
    ]);

    res.json({
      status: true,
      data: withdrawals,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

// ─── DISPUTES ────────────────────────────────────────────

exports.openDispute = async (req, res) => {
  try {
    const { orderId, reason, description } = req.body;
    const files = req.files || [];

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });
    if (order.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: false, message: 'Not your order' });
    }
    if (!['in_escrow', 'shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json({ status: false, message: 'Cannot dispute in current status' });
    }

    const evidence = files.map((f) => ({
      type: f.mimetype.startsWith('image/') ? 'image' : 'document',
      url: f.path, // adjust to your upload handler (S3, local, etc.)
      uploadedBy: req.user._id,
    }));

    if (description) {
      evidence.push({ type: 'note', note: description, uploadedBy: req.user._id });
    }

    const dispute = await Dispute.create({
      order: orderId,
      buyer: order.buyer,
      vendor: order.vendor,
      reason,
      description,
      evidence,
    });

    // Freeze the order
    order.status = 'disputed';
    await order.save();

    // TODO: Notify admin and seller about dispute

    res.status(201).json({ status: true, data: dispute });
  } catch (error) {
    console.error('openDispute error:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.resolveDispute = async (req, res) => {
  try {
    const { disputeId, decision, amount, notes } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: false, message: 'Admin only' });
    }

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) return res.status(404).json({ status: false, message: 'Dispute not found' });
    if (!['open', 'under_review'].includes(dispute.status)) {
      return res.status(400).json({ status: false, message: 'Dispute already resolved' });
    }

    const order = await Order.findById(dispute.order);
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });

    const vendorDoc = await require('../models/Vendor').findById(order.vendor);
    if (!vendorDoc) return res.status(404).json({ status: false, message: 'Vendor not found' });

    const sellerWallet = await getOrCreateWallet(vendorDoc.user, order.currency);

    if (decision === 'refund') {
      // Remove from seller's pending balance
      sellerWallet.pendingBalance = Math.max(0, sellerWallet.pendingBalance - amount);
      await sellerWallet.save();

      await logTransaction({
        wallet: sellerWallet,
        user: vendorDoc.user,
        type: 'refund',
        amount: -amount,
        currency: order.currency,
        reference: order._id.toString(),
        description: `Refund for disputed order ${order.orderNumber}`,
      });

      order.status = 'refunded';
      dispute.status = 'resolved_refund';

      // TODO: Process actual refund to buyer via payment gateway
    } else if (decision === 'release') {
      // Release to seller
      sellerWallet.pendingBalance = Math.max(0, sellerWallet.pendingBalance - amount);
      sellerWallet.availableBalance += amount;
      await sellerWallet.save();

      await logTransaction({
        wallet: sellerWallet,
        user: vendorDoc.user,
        type: 'escrow_release',
        amount,
        currency: order.currency,
        reference: order._id.toString(),
        description: `Dispute resolved - funds released for order ${order.orderNumber}`,
      });

      order.status = 'completed';
      order.escrowReleasedAt = new Date();
      dispute.status = 'resolved_release';
    }

    dispute.resolution = {
      decision,
      amount,
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      notes,
    };
    dispute.adminNotes = notes;

    await Promise.all([dispute.save(), order.save()]);

    // TODO: Notify buyer and seller about resolution

    res.json({ status: true, data: dispute });
  } catch (error) {
    console.error('resolveDispute error:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.getDispute = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id)
      .populate('buyer', 'name email')
      .populate('vendor', 'storeName')
      .populate('order');
    if (!dispute) return res.status(404).json({ status: false, message: 'Dispute not found' });
    res.json({ status: true, data: dispute });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.getAllDisputes = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (status) filter.status = status;

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate('buyer', 'name email')
        .populate('vendor', 'storeName')
        .populate('order', 'orderNumber totalAmount currency')
        .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Dispute.countDocuments(filter),
    ]);

    res.json({
      status: true,
      data: disputes,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.getMyDisputes = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { $or: [{ buyer: req.user._id }] };
    // Also include if user is vendor
    const vendorDoc = await require('../models/Vendor').findOne({ user: req.user._id });
    if (vendorDoc) {
      filter.$or.push({ vendor: vendorDoc._id });
    }

    const [disputes, total] = await Promise.all([
      Dispute.find(filter).populate('order', 'orderNumber totalAmount currency').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Dispute.countDocuments(filter),
    ]);

    res.json({
      status: true,
      data: disputes,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.addEvidence = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.disputeId);
    if (!dispute) return res.status(404).json({ status: false, message: 'Dispute not found' });

    const files = req.files || [];
    const newEvidence = files.map((f) => ({
      type: f.mimetype.startsWith('image/') ? 'image' : 'document',
      url: f.path,
      uploadedBy: req.user._id,
    }));

    if (req.body.note) {
      newEvidence.push({ type: 'note', note: req.body.note, uploadedBy: req.user._id });
    }

    dispute.evidence.push(...newEvidence);
    await dispute.save();

    res.json({ status: true, data: dispute });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

// ─── ORDERS ──────────────────────────────────────────────

exports.getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(filter).populate('buyer', 'name email').populate('vendor', 'storeName').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Order.countDocuments(filter),
    ]);

    res.json({
      status: true,
      data: orders,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('buyer', 'name email avatar')
      .populate('vendor', 'storeName storeImage');
    if (!order) return res.status(404).json({ status: false, message: 'Order not found' });
    res.json({ status: true, data: order });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const { role } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (status) filter.status = status;

    if (role === 'buyer') {
      filter.buyer = req.user._id;
    } else if (role === 'vendor') {
      const vendorDoc = await require('../models/Vendor').findOne({ user: req.user._id });
      if (!vendorDoc) return res.json({ status: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
      filter.vendor = vendorDoc._id;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter).populate('buyer', 'name email').populate('vendor', 'storeName').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Order.countDocuments(filter),
    ]);

    res.json({
      status: true,
      data: orders,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

exports.getPaymentByOrder = async (req, res) => {
  try {
    const payment = await Payment.findOne({ order: req.params.orderId });
    if (!payment) return res.status(404).json({ status: false, message: 'Payment not found' });
    res.json({ status: true, data: payment });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Server error' });
  }
};
