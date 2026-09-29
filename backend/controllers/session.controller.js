// controllers/session.controller.js
import SessionService from '../services/session.service.js';

export const getMySessions = async (req, res) => {
  const sessions = await SessionService.getSessionsByUserId(req.user.id);
  res.json(sessions);
};

export const getSessionById = async (req, res) => {
  const session = await SessionService.getSessionById(req.params.id, req.user.id);
  res.json(session);
};

export const createSession = async (req, res) => {
  const session = await SessionService.createSession(req.user.id);
  res.status(201).json(session);
};

export const createTherapySession = async (req, res) => {
  const session = await SessionService.createTherapySession(req.user.id);
  res.status(201).json(session);
};

export const updateSession = async (req, res) => {
  const updated = await SessionService.updateSession(req.params.id, req.user.id, req.body || {});
  res.json(updated);
};

export const getSessionsByUserId = async (req, res) => {
  if (req.params.userId !== req.user.id) {
    return res.status(403).json({ error: 'You can only view your own sessions' });
  }
  const sessions = await SessionService.getSessionsByUserId(req.user.id);
  res.json(sessions);
};

export const deleteSession = async (req, res) => {
  await SessionService.deleteSession(req.params.id, req.user.id);
  res.json({ message: 'Session deleted successfully' });
};
