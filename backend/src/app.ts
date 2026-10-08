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
import { publicMediaHeaders } from './utils/public-media';

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
import automationsRoutes from './routes/automations.routes';
import instagramWebhookRoutes from './routes/instagram-webhook.routes';
import integrationsRoutes from './routes/integrations.routes';
import oauthConsentRoutes from './routes/oauth-consent.routes';
import oauthRoutes from './routes/oauth.routes';
import mcpRoutes from './routes/mcp.routes';
import downloadsRoutes from './routes/downloads.routes';
import { ownerRouter as shareLinksRoutes, publicRouter as publicShareRoutes } from './routes/client-share.routes';

export function createApp() {
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
  app.use(morgan('dev'));
  app.use(compression());
  // Slow-request log for diagnosis: only requests over 1s, path without query
  // string so tokens and personal data never reach the logs.
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (ms > 1000) console.warn(`[slow] ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Math.round(ms)}ms`);
    });
    next();
  });
  app.use(cookieParser());

  // MCP clients (ChatGPT, Claude, Cursor...) call these with bearer tokens or
  // public OAuth requests, never cookies, so they carry their own permissive
  // CORS policy and body parsers and are mounted before the credentialed one.
  app.use(oauthRoutes);
  app.use(mcpRoutes);
  app.use(downloadsRoutes);

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
  app.use(express.json({ verify: (req, _res, buffer) => {
    const request = req as express.Request & { rawBody?: Buffer };
    if (request.originalUrl.startsWith('/api/webhooks/')) request.rawBody = Buffer.from(buffer);
  } }));
  app.use(express.urlencoded({ extended: true }));
  // Meta's signed webhooks have their own HMAC verification; keep provider
  // deliveries out of the per-client API budget so busy accounts don't drop events.
  app.use('/api/webhooks', instagramWebhookRoutes);
  // Limit only API traffic. Health checks and uploaded media should not consume
  // a user's API request budget, and authenticated users get separate buckets
  // even when Coolify/Traefik shares one proxy IP.
  app.use('/api', rateLimit());

  // These responses contain workspace-specific, frequently changing data.
  // Disable conditional caching so browsers do not surface Express 304 responses
  // as failed fetch() results and leave the UI with stale empty state.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Static files (uploads)
  // Upload filenames are unique per file, so browsers and the proxy may keep
  // them for a long time instead of revalidating every thumbnail.
  app.use('/uploads', express.static(uploadDir, { maxAge: '30d', immutable: true, setHeaders: publicMediaHeaders }));

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
  app.use('/api/automations', automationsRoutes);
  app.use('/api/integrations', integrationsRoutes);
  app.use('/api/oauth', oauthConsentRoutes);
  app.use('/api/share-links', shareLinksRoutes);
  // Public, read-only client view: authenticated only by the link token.
  app.use('/api/public/share', publicShareRoutes);

  // Error handling
  app.use(errorHandler);
  return app;
}
