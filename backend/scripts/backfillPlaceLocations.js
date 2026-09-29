// one-off: fills the GeoJSON `location` field for healthcare places created before it existed
import 'dotenv/config';
import mongoose from 'mongoose';
import HealthcarePlace from '../models/healthcarePlace.model.js';

await mongoose.connect(process.env.MONGO_URI);

const places = await HealthcarePlace.find({ 'location.coordinates.0': { $exists: false } });
for (const place of places) {
  place.location = { type: 'Point', coordinates: [place.longitude, place.latitude] };
  await place.save();
}
await HealthcarePlace.syncIndexes();

console.log(`Updated ${places.length} healthcare places`);
await mongoose.disconnect();
