import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  startTime: {
    type: Date,
    default: Date.now,
    immutable: true, // Prevents updates
  },
  endTime: {
    type: Date,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  sessionType: {
    type: String,
    enum: ['DIAGNOSIS', 'MENTAL_HEALTH_THERAPIST'], 
    required: true,
  },
});

export default mongoose.model('Session', sessionSchema);
