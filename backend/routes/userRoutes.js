import express from 'express';
import {
  getUserById,
  createUser,
  updateMedicalHistory
} from '../controllers/userController.js'

const router = express.Router();

router.get('/:id', getUserById);
router.post('/', createUser);
router.patch('/:id/medical-history', updateMedicalHistory);

export default router;
