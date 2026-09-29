import express from 'express';
import * as controller from '../controllers/healthcarePlace.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validate.js';

const router = express.Router();

router.get('/', controller.getAll);
router.get('/nearby', controller.getNearby);
router.get('/:id', validateObjectId('id'), controller.getById);
router.post('/', requireAuth, controller.create);
router.delete('/:id', requireAuth, validateObjectId('id'), controller.remove);

export default router;
