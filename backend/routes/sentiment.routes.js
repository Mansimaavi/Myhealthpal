import express from 'express';
import { analyze } from '../controllers/sentiment.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', requireAuth, analyze);

export default router;
