import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { setupSocketIO } from './sockets/socketHandler.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import friendRoutes from './routes/friendRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import callRoutes from './routes/callRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Enable trust proxy for Render / Cloudflare / Vercel reverse proxies
app.set('trust proxy', 1);

const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 20000,
});

// Attach io to Express app for server-side socket broadcasts
app.set('io', io);

// Connect Database
connectDB();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.CLIENT_URL,
].filter(Boolean) as string[];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com')
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Fallback allow all origins for production flexibility
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};

app.use((req, res, next) => {
  cors(corsOptions)(req, res, (err) => {
    if (err) return next(err);
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api', apiLimiter);

// Health Check & Root Endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Aurora Chat Server running healthy.' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Aurora Chat Server running healthy.' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/friend', friendRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/group', groupRoutes);
app.use('/api/call', callRoutes);

// Global Error Handler
app.use(errorHandler);

// Setup Sockets
setupSocketIO(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[Aurora Chat Server] Listening on port ${PORT}`);
});
