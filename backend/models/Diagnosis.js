import mongoose from 'mongoose';

const diagnosisSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  diagnosisText: {
    type: String,
    required: true,
    maxlength: 5000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Diagnosis = mongoose.model('Diagnosis', diagnosisSchema);
export default Diagnosis;
