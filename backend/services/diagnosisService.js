import Diagnosis from '../models/Diagnosis.js';
import Session from '../models/session.model.js';
import { HttpError } from '../middleware/validate.js';

const getUserSessionIds = async (userId) => {
  const sessions = await Session.find({ user: userId }).select('_id');
  return sessions.map(s => s._id);
};

export const getAllDiagnoses = async (userId) => {
  return await Diagnosis.find({ sessionId: { $in: await getUserSessionIds(userId) } });
};

export const getDiagnosisById = async (id, userId) => {
  return await Diagnosis.findOne({ _id: id, sessionId: { $in: await getUserSessionIds(userId) } });
};

export const createDiagnosis = async (data, userId) => {
  const { sessionId, diagnosisText } = data;
  const session = await Session.findOne({ _id: sessionId, user: userId });
  if (!session) throw new HttpError(404, 'Session not found');

  const diagnosis = new Diagnosis({ sessionId, diagnosisText });
  return await diagnosis.save();
};
