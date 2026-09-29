import mongoose from 'mongoose';

const healthcarePlaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  // GeoJSON copy of latitude/longitude so we can use a 2dsphere index
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] }, // [longitude, latitude]
  },
  imageUrl: { type: String, required: true }
}, { timestamps: true });

healthcarePlaceSchema.index({ location: '2dsphere' });

healthcarePlaceSchema.pre('validate', function (next) {
  if (this.isModified('latitude') || this.isModified('longitude') || !this.location?.coordinates?.length) {
    this.location = { type: 'Point', coordinates: [this.longitude, this.latitude] };
  }
  next();
});

export default mongoose.model('HealthcarePlace', healthcarePlaceSchema);
