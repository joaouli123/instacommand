import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';

// Routes
import authRoutes from './routes/auth.routes';
import accountsRoutes from './routes/accounts.routes';
import postsRoutes from './routes/posts.routes';
import analyticsRoutes from './routes/analytics.routes';
import competitorsRoutes from './routes/competitors.routes';
import trendsRoutes from './routes/trends.routes';
import schedulerRoutes from './routes/scheduler.routes';

// Workers
import { setupPublishPostWorker } from './jobs/publishPost.job';
import { setupCollectInsightsWorker } from './jobs/collectInsights.job';
import { setupCollectCompetitorsWorker } from './jobs/collectCompetitors.job';
import { setupRecurringJobs } from './services/scheduler.service';

const app = express();
const uploadDir = path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR);
const allowAllOrigins = env.CORS_ORIGINS.includes('*');

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowAllOrigins || env.CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit());

// Static files (uploads)
app.use('/uploads', express.static(uploadDir));

// Coolify and reverse proxies use this endpoint to determine if the API is ready.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'instacommand-api' });
});
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'instacommand-api' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/competitors', competitorsRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/api/scheduler', schedulerRoutes);

// Error handling
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Initialize workers
    setupPublishPostWorker();
    setupCollectInsightsWorker();
    setupCollectCompetitorsWorker();
    
    // Setup cron jobs
    await setupRecurringJobs();

    app.listen(Number(env.BACKEND_PORT), '0.0.0.0', () => {
      console.log(`Server is running on port ${env.BACKEND_PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
