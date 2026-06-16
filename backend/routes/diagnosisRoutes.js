import express from 'express';
import {
  getAllDiagnoses,
  getDiagnosisById,
  createDiagnosis,
} from '../services/diagnosisService.js';

const router = express.Router();

// GET all
router.get('/', async (req, res) => {
  try {
    const diagnoses = await getAllDiagnoses();
    res.json(diagnoses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET by ID
router.get('/:id', async (req, res) => {
  try {
    const diagnosis = await getDiagnosisById(req.params.id);
    if (!diagnosis) return res.status(404).json({ error: 'Not found' });
    res.json(diagnosis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const diagnosis = await createDiagnosis(req.body);
    res.status(201).json(diagnosis);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
