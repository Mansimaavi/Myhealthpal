import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true, maxlength: 100 },
  lastName:  { type: String, required: true, trim: true, maxlength: 100 },
  age:       { type: Number, required: true, min: 0, max: 130 },
  email:     {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
  },
  password:  { type: String, required: true, select: false },
  gender:    { type: String, required: true, trim: true },
  latitude:  { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 },
  medicalHistory: { type: String, default: '', maxlength: 5000 },
  hasFilledWaitingRoom: { type: Boolean, default: false }
}, {
  timestamps: true
});

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);
export default User;
