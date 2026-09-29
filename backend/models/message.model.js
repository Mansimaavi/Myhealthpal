import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  sender: {
    type: String,
    required: true,
    enum: ['user', 'ChatGPT', 'system'],
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000,
  },
  sentiment: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

messageSchema.index({ session: 1, timestamp: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
