// controllers/session.controller.js
const SessionService = require('../services/session.service');

exports.getAllSessions = async (req, res) => {
  const sessions = await SessionService.getAllSessions();
  res.json(sessions);
};

exports.getSessionById = async (req, res) => {
  const session = await SessionService.getSessionById(req.params.id);
  res.json(session);
};

exports.createSession = async (req, res) => {
  const { userId } = req.query;
  const session = await SessionService.createSession(req.body, userId);
  res.json(session);
};

exports.createTherapySession = async (req, res) => {
  const session = await SessionService.createTherapySession();
  res.json(session);
};

exports.updateSession = async (req, res) => {
  const updated = await SessionService.updateSession(req.params.id, req.body);
  res.json(updated);
};

exports.getSessionsByUserId = async (req, res) => {
  const sessions = await SessionService.getSessionsByUserId(req.params.userId);
  res.json(sessions);
};

exports.deleteSession = async (req, res) => {
  await SessionService.deleteSession(req.params.id);
  res.json({ message: 'Session deleted successfully' });
};
