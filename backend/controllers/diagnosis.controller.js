import * as diagnosisService from '../services/diagnosis.service.js';

export const getAll = async (req, res) => {
  const data = await diagnosisService.getAllDiagnoses();
  res.json(data);
};

export const getById = async (req, res) => {
  const id = req.params.id;
  const data = await diagnosisService.getDiagnosisById(id);
  res.json(data);
};

export const create = async (req, res) => {
  const data = await diagnosisService.createDiagnosis(req.body);
  res.status(201).json(data);
};
