import axios from 'axios';
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

// ---- live discovery from OpenStreetMap (Overpass API) ----

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const DISCOVERY_CACHE_MS = 10 * 60 * 1000;
const discoveryCache = new Map();

const MENTAL_HEALTH_RE = /psychiatr|psycholog|psychotherap|counsel|mental/i;

const toRad = (deg) => (deg * Math.PI) / 180;
const distanceKm = (lat1, lon1, lat2, lon2) => {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const buildQuery = (lat, lon, radiusM) => `
[out:json][timeout:20];
(
  nwr["amenity"~"^(hospital|clinic|doctors)$"](around:${radiusM},${lat},${lon});
  nwr["healthcare"~"^(hospital|clinic|doctor|psychotherapist|counselling)$"](around:${radiusM},${lat},${lon});
);
out center tags 80;`;

const formatAddress = (tags) => {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:postcode'],
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : tags['addr:full'] || null;
};

const toProvider = (el, lat, lon) => {
  const tags = el.tags || {};
  const pLat = el.lat ?? el.center?.lat;
  const pLon = el.lon ?? el.center?.lon;
  if (!tags.name || typeof pLat !== 'number' || typeof pLon !== 'number') return null;

  const kind = tags.healthcare || tags.amenity || 'clinic';
  const speciality = tags['healthcare:speciality'] || '';
  return {
    id: `osm-${el.type}-${el.id}`,
    name: tags.name,
    kind,
    speciality: speciality || null,
    mentalHealth: MENTAL_HEALTH_RE.test(`${kind} ${speciality} ${tags.name}`),
    address: formatAddress(tags),
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    openingHours: tags.opening_hours || null,
    latitude: pLat,
    longitude: pLon,
    distanceKm: Math.round(distanceKm(lat, lon, pLat, pLon) * 100) / 100,
    source: 'openstreetmap',
  };
};

export const discoverNearbyProviders = async (lat, lon, radiusKm) => {
  // round to ~1km so nearby repeat searches share the cache and we stay polite to Overpass
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${radiusKm}`;
  const cached = discoveryCache.get(key);
  if (cached && Date.now() - cached.at < DISCOVERY_CACHE_MS) return cached.data;

  const response = await axios.post(
    OVERPASS_URL,
    new URLSearchParams({ data: buildQuery(lat, lon, Math.round(radiusKm * 1000)) }),
    {
      timeout: 25000,
      headers: { 'User-Agent': 'MyHealthPal/1.0 (student project)' },
    }
  );

  if (!Array.isArray(response.data?.elements)) {
    throw new Error('Unexpected response from Overpass API');
  }

  const seen = new Set();
  const providers = response.data.elements
    .map(el => toProvider(el, lat, lon))
    .filter(p => p && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  discoveryCache.set(key, { at: Date.now(), data: providers });
  return providers;
};
