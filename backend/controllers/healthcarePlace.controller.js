import * as healthcarePlaceService from '../services/healtcarePlace.service.js';

export const getAll = async (req, res) => {
  const data = await healthcarePlaceService.getAllHealthcarePlaces();
  res.json(data);
};

export const getById = async (req, res) => {
  const id = req.params.id;
  const data = await healthcarePlaceService.getHealthcarePlaceById(id);
  res.json(data);
};

export const create = async (req, res) => {
  const data = await healthcarePlaceService.createHealthcarePlace(req.body);
  res.status(201).json(data);
};

export const remove = async (req, res) => {
  await healthcarePlaceService.deleteHealthcarePlace(req.params.id);
  res.status(204).send();
};

export const getNearby = async (req, res) => {
  const { latitude, longitude, maxDistance } = req.query;
  const data = await healthcarePlaceService.getNearbyHealthcarePlaces(
    parseFloat(latitude),
    parseFloat(longitude),
    parseFloat(maxDistance)
  );
  res.json(data);
};
