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
  emotion: {
    type: String,
  },
  // knowledge base sources cited in an AI reply, numbered as in the reply text
  sources: {
    type: [{
      _id: false,
      n: Number,
      title: String,
      url: String,
    }],
    default: undefined,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

messageSchema.index({ session: 1, timestamp: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
