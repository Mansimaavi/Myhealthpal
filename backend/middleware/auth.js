import jwt from 'jsonwebtoken';

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const signToken = (userId) =>
  jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(userId),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
