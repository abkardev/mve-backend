/**
 * Stripe Webhook Handler
 * 
 * Set up in your main server:
 *   app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
 * 
 * Configure Stripe webhook endpoint in Stripe Dashboard to point to:
 *   https://yourdomain.com/api/webhooks/stripe
 * 
 * Events to listen for:
 *   - checkout.session.completed
 *   - payment_intent.succeeded
 *   - payment_intent.payment_failed
 */

const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Vendor = require('../models/Vendor');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function stripeWebhook(req, res) {
  let event;

  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { orderId, paymentId } = session.metadata;

        const payment = await Payment.findById(paymentId);
        if (!payment) break;

        payment.status = 'completed';
        payment.gatewayRef = session.payment_intent;
        payment.gatewayResponse = session;
        await payment.save();

        const order = await Order.findById(orderId);
        if (!order) break;

        order.status = 'in_escrow';
        order.paymentId = payment._id;
        order.autoReleaseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await order.save();

        // Credit seller's pending balance
        const vendorDoc = await Vendor.findById(order.vendor);
        if (vendorDoc) {
          let wallet = await Wallet.findOne({ user: vendorDoc.user });
          if (!wallet) wallet = await Wallet.create({ user: vendorDoc.user, currency: order.currency });

          wallet.pendingBalance += order.totalAmount;
          await wallet.save();

          await Transaction.create({
            wallet: wallet._id,
            user: vendorDoc.user,
            type: 'escrow_hold',
            amount: order.totalAmount,
            currency: order.currency,
            balance: wallet.pendingBalance,
            reference: order._id.toString(),
            description: `Escrow hold for order ${order.orderNumber}`,
          });
        }

        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        // Find payment by gateway ref and mark as failed
        const payment = await Payment.findOne({ gatewayRef: intent.id });
        if (payment) {
          payment.status = 'failed';
          payment.gatewayResponse = intent;
          await payment.save();
        }
        break;
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
  }

  res.json({ received: true });
}

module.exports = stripeWebhook;
