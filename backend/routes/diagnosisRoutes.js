import express from 'express';
import {
  getAllDiagnoses,
  getDiagnosisById,
  createDiagnosis,
} from '../services/diagnosisService.js';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validate.js';

const router = express.Router();

router.use(requireAuth);

// GET all (for the logged in user)
router.get('/', async (req, res) => {
  const diagnoses = await getAllDiagnoses(req.user.id);
  res.json(diagnoses);
});

// GET by ID
router.get('/:id', validateObjectId('id'), async (req, res) => {
  const diagnosis = await getDiagnosisById(req.params.id, req.user.id);
  if (!diagnosis) return res.status(404).json({ error: 'Not found' });
  res.json(diagnosis);
});

// POST
router.post('/', async (req, res) => {
  const diagnosis = await createDiagnosis(req.body || {}, req.user.id);
  res.status(201).json(diagnosis);
});

export default router;
