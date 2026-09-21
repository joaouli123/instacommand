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
import settingsRoutes from './routes/settings.routes';
import aiRoutes from './routes/ai.routes';
import notificationsRoutes from './routes/notifications.routes';
import communityRoutes from './routes/community.routes';

// Workers
import { setupPublishPostWorker } from './jobs/publishPost.job';
import { setupCollectInsightsWorker } from './jobs/collectInsights.job';
import { setupCollectCompetitorsWorker } from './jobs/collectCompetitors.job';
import { setupRecurringJobs } from './services/scheduler.service';

const app = express();
const uploadDir = path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR);
const allowAllOrigins = env.CORS_ORIGINS.includes('*');
const allowedOrigins = new Set([
  ...env.CORS_ORIGINS.filter((origin) => origin !== '*').map((origin) => origin.replace(/\/$/, '')),
  env.FRONTEND_URL.replace(/\/$/, ''),
  'http://instagram.uxcode.com.br',
  'https://instagram.uxcode.com.br',
  'http://instacommand.179.198.98.63.sslip.io',
  'https://instacommand.179.198.98.63.sslip.io',
]);

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowAllOrigins || allowedOrigins.has(origin)) {
      // With credentials enabled, reflect the concrete origin instead of returning
      // `*`, which browsers reject during credentialed preflight requests.
      return callback(null, origin || true);
    }
    // A rejected browser origin is expected CORS behavior, not an application
    // failure. Returning false keeps the API healthy and simply omits CORS headers.
    return callback(null, false);
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
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/community', communityRoutes);

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
