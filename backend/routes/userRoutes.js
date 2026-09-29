import express from 'express';
import {
  getUserById,
  createUser,
  login,
  updateMedicalHistory
} from '../controllers/userController.js'
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validate.js';

const router = express.Router();

router.post('/', createUser);
router.post('/login', login);
router.get('/:id', requireAuth, validateObjectId('id'), getUserById);
router.patch('/:id/medical-history', requireAuth, validateObjectId('id'), updateMedicalHistory);

export default router;
