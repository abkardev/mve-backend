/**
 * Escrow Auto-Release Cron Job
 * 
 * Run this with node-cron or a system cron every hour:
 *   const cron = require('node-cron');
 *   cron.schedule('0 * * * *', () => require('./jobs/escrowAutoRelease')());
 * 
 * Or add to your server startup.
 */

const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Vendor = require('../models/Vendor');

async function escrowAutoRelease() {
  console.log('[CRON] Running escrow auto-release check...');

  try {
    // Find orders where auto-release date has passed
    const overdueOrders = await Order.find({
      status: { $in: ['shipped', 'in_escrow'] },
      autoReleaseDate: { $lte: new Date() },
    });

    console.log(`[CRON] Found ${overdueOrders.length} orders eligible for auto-release`);

    for (const order of overdueOrders) {
      try {
        const vendorDoc = await Vendor.findById(order.vendor);
        if (!vendorDoc) continue;

        let wallet = await Wallet.findOne({ user: vendorDoc.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: vendorDoc.user, currency: order.currency });
        }

        // Move funds from pending to available
        wallet.pendingBalance = Math.max(0, wallet.pendingBalance - order.totalAmount);
        wallet.availableBalance += order.totalAmount;
        await wallet.save();

        // Log transaction
        await Transaction.create({
          wallet: wallet._id,
          user: vendorDoc.user,
          type: 'escrow_release',
          amount: order.totalAmount,
          currency: order.currency,
          balance: wallet.availableBalance,
          reference: order._id.toString(),
          description: `Auto-release for order ${order.orderNumber} (buyer did not confirm)`,
        });

        // Update order
        order.status = 'completed';
        order.escrowReleasedAt = new Date();
        await order.save();

        console.log(`[CRON] Auto-released order ${order.orderNumber}`);

        // TODO: Notify buyer and seller about auto-release
      } catch (err) {
        console.error(`[CRON] Failed to auto-release order ${order._id}:`, err);
      }
    }
  } catch (error) {
    console.error('[CRON] Escrow auto-release error:', error);
  }
}

module.exports = escrowAutoRelease;
