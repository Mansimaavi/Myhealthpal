import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import diagnosisRoutes from './routes/diagnosisRoutes.js';
import healthcareRoutes from './routes/healthcarePlace.routes.js';
import sentimentRoutes from './routes/sentiment.routes.js';
import sessionRoutes from './routes/session.routes.js'; 
import userRoutes from './routes/userRoutes.js';
import messageRoutes from './routes/message.routes.js';
import { errorHandler } from './middleware/validate.js';

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '100kb' }));

// Route mounting
app.use('/api/diagnoses', diagnosisRoutes);
app.use('/api/healthcare-places', healthcareRoutes);
app.use('/api/sentiment', sentimentRoutes);
app.use('/api/sessions', sessionRoutes); 
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// in production the built React app (frontend/dist) is served from the same server,
// so the frontend and API share one origin; in development Vite serves it instead
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist');

if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('👋 Welcome to My HealthPal API');
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler);

export default app;
