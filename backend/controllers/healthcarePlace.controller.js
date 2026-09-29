import * as healthcarePlaceService from '../services/healthcarePlace.service.js';

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 100;

export const getAll = async (req, res) => {
  const data = await healthcarePlaceService.getAllHealthcarePlaces();
  res.json(data);
};

export const getById = async (req, res) => {
  const id = req.params.id;
  const data = await healthcarePlaceService.getHealthcarePlaceById(id);
  if (!data) return res.status(404).json({ error: 'Healthcare place not found' });
  res.json(data);
};

export const create = async (req, res) => {
  const data = await healthcarePlaceService.createHealthcarePlace(req.body || {});
  res.status(201).json(data);
};

export const remove = async (req, res) => {
  const deleted = await healthcarePlaceService.deleteHealthcarePlace(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Healthcare place not found' });
  res.status(204).send();
};

export const getNearby = async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const maxDistance = req.query.maxDistance === undefined ? DEFAULT_RADIUS_KM : Number(req.query.maxDistance);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);

  if (req.query.latitude === undefined || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return res.status(400).json({ error: 'latitude must be a number between -90 and 90' });
  }
  if (req.query.longitude === undefined || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'longitude must be a number between -180 and 180' });
  }
  if (!Number.isFinite(maxDistance) || maxDistance <= 0 || maxDistance > MAX_RADIUS_KM) {
    return res.status(400).json({ error: `maxDistance must be between 0 and ${MAX_RADIUS_KM} km` });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'limit must be an integer between 1 and 100' });
  }

  const data = await healthcarePlaceService.getNearbyHealthcarePlaces(latitude, longitude, maxDistance, limit);
  res.json(data);
};

export const discover = async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const radius = req.query.radius === undefined ? 5 : Number(req.query.radius);

  if (req.query.latitude === undefined || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return res.status(400).json({ error: 'latitude must be a number between -90 and 90' });
  }
  if (req.query.longitude === undefined || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'longitude must be a number between -180 and 180' });
  }
  if (!Number.isFinite(radius) || radius <= 0 || radius > 20) {
    return res.status(400).json({ error: 'radius must be between 0 and 20 km' });
  }

  try {
    let providers = await healthcarePlaceService.discoverNearbyProviders(latitude, longitude, radius);
    if (req.query.mentalHealth === 'true') providers = providers.filter(p => p.mentalHealth);
    res.json(providers.slice(0, 50));
  } catch (err) {
    console.error('Provider discovery failed:', err.message);
    res.status(502).json({ error: 'Could not reach the map service. Try again in a minute.' });
  }
};
