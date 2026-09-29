import bcrypt from 'bcryptjs';
import User from '../models/user.js'
import { signToken } from '../middleware/auth.js';

const PROFILE_FIELDS = ['firstName', 'lastName', 'age', 'email', 'gender', 'latitude', 'longitude', 'medicalHistory'];

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const ensureSelf = (req, res) => {
  if (req.params.id !== req.user.id) {
    res.status(403).json({ error: 'You can only access your own profile' });
    return false;
  }
  return true;
};

export const getUserById = async (req, res) => {
  if (!ensureSelf(req, res)) return;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
};

export const createUser = async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const data = pick(req.body, PROFILE_FIELDS);
  data.password = await bcrypt.hash(password, 10);

  const saved = await new User(data).save();
  res.status(201).json({ user: saved, token: signToken(saved._id) });
};

export const login = async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({ user, token: signToken(user._id) });
};

export const updateMedicalHistory = async (req, res) => {
  if (!ensureSelf(req, res)) return;

  let medicalHistory = req.body?.medicalHistory;
  if (typeof medicalHistory !== 'string') {
    return res.status(400).json({ error: 'medicalHistory must be a string' });
  }
  medicalHistory = medicalHistory.replace(/\\n/g, '').replace(/\\"/g, '"').trim();
  if (medicalHistory.startsWith('"') && medicalHistory.endsWith('"')) {
    medicalHistory = medicalHistory.slice(1, -1);
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.medicalHistory = medicalHistory;
  user.hasFilledWaitingRoom = true;
  await user.save();
  res.json(user);
};
