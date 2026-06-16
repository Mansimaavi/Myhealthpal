import express from 'express';
import * as controller from '../controllers/healthcarePlace.controller.js';

const router = express.Router();

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.delete('/:id', controller.remove);
router.get('/nearby', controller.getNearby);

export default router;
