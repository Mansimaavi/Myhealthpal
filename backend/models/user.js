import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  age:       { type: Number, required: true },
  email:     { type: String, required: true, unique: true },
  gender:    { type: String, required: true },
  latitude:  { type: Number },
  longitude: { type: Number },
  medicalHistory: { type: String, default: '' },
  hasFilledWaitingRoom: { type: Boolean, default: false }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);
export default User;
