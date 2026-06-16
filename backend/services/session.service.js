// services/session.service.js
const Session = require('../models/session.model');
const User = require('../models/user.model');
const MessageService = require('./message.service');

const getAllSessions = async () => {
  return await Session.find();
};

const getSessionById = async (id) => {
  const session = await Session.findById(id);
  if (!session) throw new Error(`Session not found with ID: ${id}`);
  return session;
};

const getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error(`User not found with ID: ${userId}`);
  return user;
};

const createSession = async (sessionData, userId) => {
  const user = await getUserById(userId);
  sessionData.user = user._id;

  const session = new Session(sessionData);
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
    sender: 'user'
  }, savedSession._id);

  const content = `The user being diagnosed has the following details: Gender: ${user.gender}, Age: ${user.age}, Medical History: ${user.medicalHistory}.`;

  await MessageService.createMessage({
    content: content,
    sender: 'user'
  }, savedSession._id);

  return savedSession;
};

const createTherapySession = async (sessionData) => {
  const session = new Session(sessionData);
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
    sender: 'user'
  }, savedSession._id);

  return savedSession;
};

const updateSession = async (id, updatedData) => {
  const session = await getSessionById(id);
  session.endTime = updatedData.endTime;
  session.completed = updatedData.completed;
  return await session.save();
};

const getSessionsByUserId = async (userId) => {
  return await Session.find({ user: userId });
};

const deleteSession = async (id) => {
  await Session.findByIdAndDelete(id);
};

module.exports = {
  getAllSessions,
  getSessionById,
  createSession,
  createTherapySession,
  updateSession,
  getSessionsByUserId,
  deleteSession
};
