const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    availableBalance: { type: Number, default: 0, min: 0 },
    pendingBalance: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: ['USD', 'SAR', 'EUR'], default: 'USD' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
