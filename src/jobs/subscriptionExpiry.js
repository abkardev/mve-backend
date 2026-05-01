const Subscription = require('../models/Subscription');

/**
 * Daily cron: mark subscriptions whose endDate has passed as expired.
 * Schedule with node-cron in your server entry:
 *   cron.schedule('0 2 * * *', () => require('./jobs/subscriptionExpiry').run());
 */
async function run() {
  const now = new Date();
  const result = await Subscription.updateMany(
    { status: 'active', endDate: { $lt: now } },
    { status: 'expired' }
  );
  console.log(`[subscriptionExpiry] Expired ${result.modifiedCount} subscriptions`);

  // OPTIONAL: send renewal reminder for subs expiring in 14 days
  const reminderDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const expiringSoon = await Subscription.find({
    status: 'active',
    autoRenew: false, // only remind users who turned off auto-renew
    endDate: { $lt: reminderDate, $gt: now },
  }).populate('userId', 'email name');

  for (const sub of expiringSoon) {
    // hook into your email service
    console.log(`[reminder] ${sub.userId.email} expires ${sub.endDate.toISOString()}`);
  }
}

module.exports = { run };
