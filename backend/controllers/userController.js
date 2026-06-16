import User from '../models/user.js'

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const user = new User(req.body);
    const saved = await user.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const updateMedicalHistory = async (req, res) => {
  try {
    let medicalHistory = req.body.medicalHistory;
    if (typeof medicalHistory === 'string') {
      medicalHistory = medicalHistory.replace(/\\n/g, '').replace(/\\"/g, '"').trim();
      if (medicalHistory.startsWith('"') && medicalHistory.endsWith('"')) {
        medicalHistory = medicalHistory.slice(1, -1);
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { medicalHistory },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
