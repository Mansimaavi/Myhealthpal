import express from 'express';
import cors from 'cors';
import diagnosisRoutes from './routes/diagnosisRoutes.js';
import healthcareRoutes from './routes/healthcarePlace.routes.js';
import sentimentRoutes from './routes/sentiment.routes.js';
import sessionRoutes from './routes/session.routes.js'; 
import userRoutes from './routes/userRoutes.js';
import messageController from './controllers/messageController.js';

const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: '*',
  credentials: true
}));

app.use(express.json());

// Route mounting
app.use('/api/diagnoses', diagnosisRoutes);
app.use('/api/healthcare-places', healthcareRoutes);
app.use('/api/sentiment', sentimentRoutes);
app.use('/api/sessions', sessionRoutes); 
app.use('/api/users', userRoutes);
app.use('/api/messages', messageController);

app.get('/', (req, res) => {
  res.send('👋 Welcome to My HealthPal API');
});

export default app;
