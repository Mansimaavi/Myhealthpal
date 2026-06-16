import express from 'express';
import { analyze } from '../controllers/sentiment.controller.js';

const router = express.Router();

router.post('/', analyze);

export default router;
