import express from 'express';
import {
  deleteUserProfile,
  getAllProfile,
  loginUser,
  profile,
  registerUser,
  updateProfile,
} from '../controllers/authController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/user/register', registerUser);
router.post('/user/login', loginUser);
router.get('/user/profile', protect, profile);
router.put('/user/profile', protect, updateProfile);
router.get('/users', protect, authorize('admin'), getAllProfile);
router.delete('/users/:id', protect, authorize('admin'), deleteUserProfile);

export default router;
