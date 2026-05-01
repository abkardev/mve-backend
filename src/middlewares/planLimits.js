const Subscription = require('../models/Subscription');
const Product = require('../models/Product'); // assumes existing Product model

/**
 * Loads the requesting vendor's active subscription onto req.subscription.
 * If none, leaves req.subscription = null.
 */
async function loadSubscription(req, _res, next) {
  try {
    if (!req.user) return next();
    if (req.user.role !== 'vendor') return next();
    req.subscription = await Subscription.findActiveForUser(req.user._id);
    next();
  } catch (err) { next(err); }
}

function requireActiveSubscription(req, res, next) {
  if (req.user?.role !== 'vendor') return next(); // non-vendors not gated
  if (!req.subscription) {
    return res.status(403).json({
      status: false,
      message: 'Active subscription required. Please choose a plan to continue.',
      code: 'NO_SUBSCRIPTION',
    });
  }
  next();
}

/**
 * Enforce the plan's product listing limit on POST /products.
 */
async function enforceProductLimit(req, res, next) {
  try {
    if (req.user?.role !== 'vendor') return next();
    if (!req.subscription) {
      return res.status(403).json({ status: false, message: 'Active subscription required to list products.' });
    }
    const limit = req.subscription.features?.maxProducts ?? 0;
    if (limit === -1) return next(); // unlimited
    const count = await Product.countDocuments({ vendor: req.user._id, isActive: true });
    if (count >= limit) {
      return res.status(403).json({
        status: false,
        message: `Plan limit reached (${limit} products). Upgrade to add more.`,
        code: 'PRODUCT_LIMIT_REACHED',
        upgradeUrl: '/pricing',
      });
    }
    next();
  } catch (err) { next(err); }
}

/**
 * Generic feature gate: pass a predicate that receives the features object.
 * Usage: router.post('/...', requireFeature(f => f.fileSharing, 'File sharing requires Growth plan'))
 */
function requireFeature(predicate, message) {
  return (req, res, next) => {
    if (req.user?.role !== 'vendor') return next();
    if (!req.subscription || !predicate(req.subscription.features)) {
      return res.status(403).json({
        status: false,
        message: message || 'Your plan does not include this feature.',
        code: 'FEATURE_NOT_AVAILABLE',
        upgradeUrl: '/pricing',
      });
    }
    next();
  };
}

module.exports = {
  loadSubscription,
  requireActiveSubscription,
  enforceProductLimit,
  requireFeature,
};
