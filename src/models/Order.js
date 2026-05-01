const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: {
    en: { type: String, required: true },
    ar: { type: String },
  },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 },
});

const shippingDetailsSchema = new mongoose.Schema({
  carrier: { type: String, required: true },
  trackingNumber: { type: String, required: true },
  shippedAt: { type: Date, default: Date.now },
  estimatedDelivery: { type: Date },
  deliveredAt: { type: Date },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'SAR', 'EUR'], default: 'USD' },
    status: {
      type: String,
      enum: ['pending', 'awaiting_payment', 'in_escrow', 'shipped', 'delivered', 'completed', 'disputed', 'refunded'],
      default: 'pending',
    },
    paymentMethod: { type: String, enum: ['credit_card', 'bank_transfer', 'paypal'] },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    shippingDetails: shippingDetailsSchema,
    escrowReleasedAt: { type: Date },
    autoReleaseDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

// Generate unique order number
orderSchema.pre('validate', async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD-${Date.now()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
