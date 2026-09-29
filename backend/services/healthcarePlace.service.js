import HealthcarePlace from '../models/healthcarePlace.model.js';

export const getAllHealthcarePlaces = async () => {
  return await HealthcarePlace.find();
};

export const getHealthcarePlaceById = async (id) => {
  return await HealthcarePlace.findById(id);
};

export const createHealthcarePlace = async (data) => {
  const { name, address, latitude, longitude, imageUrl } = data;
  return await HealthcarePlace.create({ name, address, latitude, longitude, imageUrl });
};

export const deleteHealthcarePlace = async (id) => {
  return await HealthcarePlace.findByIdAndDelete(id);
};

// maxDistance is in km; results are sorted nearest first and include distanceKm
export const getNearbyHealthcarePlaces = async (lat, lon, maxDistance, limit = 20) => {
  const places = await HealthcarePlace.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lon, lat] },
        distanceField: 'distance',
        maxDistance: maxDistance * 1000,
        spherical: true,
      },
    },
    { $limit: limit },
  ]);

  return places.map(({ distance, ...place }) => ({
    ...place,
    distanceKm: Math.round(distance) / 1000,
  }));
};
