import mongoose from 'mongoose';

const healthcarePlaceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  imageUrl: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('HealthcarePlace', healthcarePlaceSchema);
