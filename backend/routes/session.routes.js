// routes/session.routes.js
const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');

router.get('/', sessionController.getAllSessions);
router.get('/:id', sessionController.getSessionById);
router.post('/', sessionController.createSession);
router.post('/therapy', sessionController.createTherapySession);
router.put('/:id', sessionController.updateSession);
router.get('/user/:userId', sessionController.getSessionsByUserId);
router.delete('/:id', sessionController.deleteSession);

module.exports = router;
