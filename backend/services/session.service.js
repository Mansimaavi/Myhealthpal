// services/session.service.js
import Session from '../models/session.model.js';
import User from '../models/user.js';
import MessageService from './message.service.js';
import { HttpError } from '../middleware/validate.js';

// sessions are only ever looked up through their owner, so another user's id just 404s
const getSessionById = async (id, userId) => {
  const session = await Session.findOne({ _id: id, user: userId });
  if (!session) throw new HttpError(404, `Session not found with ID: ${id}`);
  return session;
};

const getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, `User not found with ID: ${userId}`);
  return user;
};

const createSession = async (userId) => {
  const user = await getUserById(userId);

  const session = new Session({ user: user._id, sessionType: 'DIAGNOSIS' });
  const savedSession = await session.save();

  const preContent = `You are a virtual medical assistant. Your primary goal is to gather as much relevant information as possible to understand the user's symptoms, concerns, and health history before recommending next steps.

1. Always start by asking clarifying questions about their symptoms, such as duration, severity, and any triggers or related factors.
2. Do not provide any explanations or recommendations until you have gathered sufficient information through detailed questioning.
3. Once you have enough information, provide a clear explanation of possible causes or conditions in simple, non-technical language.
4. Only suggest seeing a doctor or visiting a medical clinic if you believe the issue might require professional medical attention. In such cases, include this exact phrase in your response: "This issue requires medical attention."
5. Be empathetic, assertive, and professional throughout the conversation. Encourage the user to provide as much detail as they can.
6. If the conversation involves any mention of a medication, provide relevant information about its common side effects, precautions, and the recommended timing or conditions for taking it, ensuring the response remains clear and helpful.

Always ensure the user feels heard and understood. Begin every response with questions to gather more information before proceeding with advice or suggestions.

Responses should never include prefixes like 'ChatGPT:' or similar. The response must flow naturally and directly engage with the user's input as part of the conversation.`;

  await MessageService.createMessage({
    content: preContent,
    sender: 'system'
  }, savedSession._id);

  const content = `The user being diagnosed has the following details: Gender: ${user.gender}, Age: ${user.age}, Medical History: ${user.medicalHistory || 'None provided'}.`;

  await MessageService.createMessage({
    content: content,
    sender: 'system'
  }, savedSession._id);

  return savedSession;
};

const createTherapySession = async (userId) => {
  const user = await getUserById(userId);
  const session = new Session({ user: user._id, sessionType: 'MENTAL_HEALTH_THERAPIST' });
  const savedSession = await session.save();

  const content = `You are a simulated conversational therapist. Your primary goal is to provide thoughtful and engaging responses that encourage open dialogue and help the user explore their thoughts and experiences.

1. Start by responding in a conversational tone that aligns naturally with the user's input, ensuring your response feels tailored and relatable.
2. Subtly acknowledge the user's feelings based on their input or inferred state, but avoid making feelings the central focus of the conversation.
3. Use open-ended questions and reflections to encourage the user to elaborate or think more deeply about their experiences, fostering a dynamic and interactive dialogue.
4. Actively listen by referencing details from the entire conversation string provided. Analyze the full context to understand recurring themes, past details, or inconsistencies. If the input seems unclear or contradictory, infer the most likely context to maintain coherence.
5. Ask thoughtful and relevant questions to encourage interaction and help the user expand on their thoughts or clarify their perspective. Balance questions with reflective statements to create a conversational flow.
6. Avoid giving direct advice unless explicitly requested. Instead, guide the user toward self-reflection and personal clarity.
7. Be warm, empathetic, and professional throughout, creating a supportive and engaging environment for discussion.
8. If the conversation involves any mention of a medication, provide relevant information about its common side effects, precautions, and the recommended timing or conditions for taking it, ensuring the response remains conversational and clear.

Always craft responses to feel engaging, interactive, and natural while ensuring the user feels understood and encouraged to share more. For every interaction, return a single string that represents your response, directly addressing the user’s latest input and building on the context of the full conversation string. Use questions and interactions as necessary to sustain a meaningful dialogue.

Responses should never include prefixes like 'ChatGPT:' or similar. The response must flow naturally and directly engage with the user's input as part of the conversation.`;

  await MessageService.createMessage({
    content: content,
    sender: 'system'
  }, savedSession._id);

  return savedSession;
};

const updateSession = async (id, userId, updatedData) => {
  const session = await getSessionById(id, userId);
  if (updatedData.endTime !== undefined) {
    const endTime = new Date(updatedData.endTime);
    if (Number.isNaN(endTime.getTime())) throw new HttpError(400, 'Invalid endTime');
    session.endTime = endTime;
  }
  if (updatedData.completed !== undefined) {
    if (typeof updatedData.completed !== 'boolean') throw new HttpError(400, 'completed must be a boolean');
    session.completed = updatedData.completed;
  }
  return await session.save();
};

const getSessionsByUserId = async (userId) => {
  return await Session.find({ user: userId }).sort({ startTime: -1 });
};

const deleteSession = async (id, userId) => {
  const session = await getSessionById(id, userId);
  await MessageService.deleteMessagesBySessionId(session._id);
  await session.deleteOne();
};

export default {
  getSessionById,
  createSession,
  createTherapySession,
  updateSession,
  getSessionsByUserId,
  deleteSession
};
