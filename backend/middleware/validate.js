import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// checks that every named route param is a valid ObjectId
export const validateObjectId = (...params) => (req, res, next) => {
  for (const p of params) {
    if (!mongoose.isValidObjectId(req.params[p])) {
      return res.status(400).json({ error: `Invalid ${p}` });
    }
  }
  next();
};

export const errorHandler = (err, req, res, next) => {
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Invalid ${err.path}` });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value', fields: Object.keys(err.keyValue || {}) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  // e.g. body-parser's 413 payload too large
  if (err.expose && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
