import expressAsyncHandler from 'express-async-handler';
import { Vendor } from '../models/vendorModel.js';
import { AppError } from '../middleware/errorHandler.js';

export const createVendor = expressAsyncHandler(async (req, res) => {
  const payload = { ...req.body, user: req.body.user || req.user?._id };
  const newVendor = await Vendor.create(payload);
  res.status(201).json({ status: true, data: newVendor });
});

export const getVendors = expressAsyncHandler(async (_req, res) => {
  const vendors = await Vendor.find({ isActive: true }).populate('user', '-password');
  res.json({ status: true, data: vendors });
});

export const getVendorBySlug = expressAsyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ slug: req.params.slug }).populate('user', '-password');
  if (!vendor) throw new AppError('Vendor not found', 404);
  res.json({ status: true, data: vendor });
});

export const updateVendor = expressAsyncHandler(async (req, res) => {
  const vendor = await Vendor.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!vendor) throw new AppError('Vendor not found', 404);
  res.json({ status: true, data: vendor });
});

export const deleteVendor = expressAsyncHandler(async (req, res) => {
  const vendor = await Vendor.findByIdAndDelete(req.params.id);
  if (!vendor) throw new AppError('Vendor not found', 404);
  res.json({ status: true, message: 'Vendor removed' });
});
