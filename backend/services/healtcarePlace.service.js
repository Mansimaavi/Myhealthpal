
import HealthcarePlace from '../models/healthcarePlace.model.js';

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const getAllHealthcarePlaces = async () => {
  return await HealthcarePlace.find();
};

export const getHealthcarePlaceById = async (id) => {
  return await HealthcarePlace.findById(id);
};

export const createHealthcarePlace = async (data) => {
  return await HealthcarePlace.create(data);
};

export const deleteHealthcarePlace = async (id) => {
  return await HealthcarePlace.findByIdAndDelete(id);
};

export const getNearbyHealthcarePlaces = async (lat, lon, maxDistance) => {
  const allPlaces = await HealthcarePlace.find();
  return allPlaces.filter(place => {
    return calculateDistance(lat, lon, place.latitude, place.longitude) <= maxDistance;
  });
};
