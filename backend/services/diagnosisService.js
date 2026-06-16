import Diagnosis from '../models/Diagnosis.js';

export const getAllDiagnoses = async () => {
  return await Diagnosis.find();
};

export const getDiagnosisById = async (id) => {
  return await Diagnosis.findById(id);
};

export const createDiagnosis = async (data) => {
  const diagnosis = new Diagnosis(data);
  return await diagnosis.save();
};
