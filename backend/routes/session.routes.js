// routes/session.routes.js
import express from 'express';
import * as sessionController from '../controllers/session.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validate.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', sessionController.getMySessions);
router.post('/', sessionController.createSession);
router.post('/therapy', sessionController.createTherapySession);
router.get('/user/:userId', validateObjectId('userId'), sessionController.getSessionsByUserId);
router.get('/:id', validateObjectId('id'), sessionController.getSessionById);
router.put('/:id', validateObjectId('id'), sessionController.updateSession);
router.delete('/:id', validateObjectId('id'), sessionController.deleteSession);

export default router;
