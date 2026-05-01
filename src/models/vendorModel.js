import mongoose from 'mongoose';
import slugify from 'slugify';

const subscriptionSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      enum: ['starter', 'growth', 'pro', 'basic', 'premium'],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, required: true },
  },
  { _id: false }
);

const vendorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    storeName: {
      en: { type: String, required: true, trim: true },
      ar: { type: String, trim: true },
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    storeDescription: {
      en: { type: String, required: true },
      ar: String,
    },
    storeImage: String,
    storeBanner: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    subscription: subscriptionSchema,
  },
  { timestamps: true }
);

vendorSchema.pre('save', function createSlug(next) {
  if (this.isModified('storeName') || !this.slug) {
    this.slug = slugify(this.storeName.en, { lower: true, strict: true });
  }
  next();
});

export const Vendor = mongoose.model('Vendor', vendorSchema);
