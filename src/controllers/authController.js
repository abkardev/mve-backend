import expressAsyncHandler from 'express-async-handler';
import { User } from '../models/userModel.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateToken, sanitizeUser } from '../utils/utils.js';

const sendAuthResponse = (res, statusCode, user, message) => {
  const token = generateToken(user);
  res.status(statusCode).json({
    status: true,
    data: {
      user: sanitizeUser(user),
      token,
    },
    message,
  });
};

export const registerUser = expressAsyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    throw new AppError('Name, email, and password are required', 400);
  }

  const userExists = await User.findOne({ email: email.toLowerCase() });
  if (userExists) {
    throw new AppError('User already exists', 409);
  }

  const safeRole = ['user', 'vendor'].includes(role) ? role : 'user';
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role: safeRole,
  });

  sendAuthResponse(res, 201, user, 'Registered successfully');
});

export const loginUser = expressAsyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError('This account is disabled', 403);
  }

  sendAuthResponse(res, 200, user, 'Logged in successfully');
});

export const profile = expressAsyncHandler(async (req, res) => {
  res.json({ status: true, data: sanitizeUser(req.user) });
});

export const updateProfile = expressAsyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw new AppError('User not found', 404);

  user.name = req.body.name || user.name;
  user.email = req.body.email?.toLowerCase() || user.email;
  user.address = req.body.address || user.address;
  user.phone = req.body.phone || user.phone;
  if (req.body.password) user.password = req.body.password;

  const updatedUser = await user.save();
  res.json({ status: true, data: sanitizeUser(updatedUser), message: 'Profile updated' });
});

export const getAllProfile = expressAsyncHandler(async (_req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json({ status: true, data: users });
});

export const deleteUserProfile = expressAsyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  res.json({ status: true, message: 'User removed' });
});
