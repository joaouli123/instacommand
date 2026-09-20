import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BACKEND_PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32).default('change-this-development-secret-32-chars'),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default('v25.0'),
  THREADS_APP_ID: z.string().optional(),
  THREADS_APP_SECRET: z.string().optional(),
  THREADS_REDIRECT_URI: z.string().optional(),
  // Legacy names remain supported so existing Coolify variables keep working.
  FB_APP_ID: z.string().optional(),
  FB_APP_SECRET: z.string().optional(),
  FB_REDIRECT_URI: z.string().optional(),
  // Facebook Login for Business configuration that contains the app's assets and permissions.
  FB_LOGIN_CONFIG_ID: z.string().optional(),
  // Optional comma-separated permissions enabled in the Meta Login for Business configuration.
  // Keep the default limited to permissions that are currently enabled in the personal app.
  FB_OAUTH_SCOPES: z.string().optional(),
  BACKEND_URL: z.string().default('http://localhost:3001'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  MEDIA_UPLOAD_DIR: z.string().default('./uploads'),
  MEDIA_PUBLIC_URL: z.string().optional(),
  // 64 hex characters = 32 bytes for aes-256
  ENCRYPTION_KEY: z.string().min(32).default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  FB_APP_ID: parsed.META_APP_ID || parsed.FB_APP_ID || '',
  FB_APP_SECRET: parsed.META_APP_SECRET || parsed.FB_APP_SECRET || '',
  FB_REDIRECT_URI: parsed.FB_REDIRECT_URI || `${parsed.BACKEND_URL.replace(/\/$/, '')}/api/auth/facebook/callback`,
  // Public Meta configuration ID for this personal deployment; override it in Coolify when using another app.
  FB_LOGIN_CONFIG_ID: parsed.FB_LOGIN_CONFIG_ID || '1443592261011561',
  FB_OAUTH_SCOPES:
    parsed.FB_OAUTH_SCOPES ||
    'business_management,instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement',
  THREADS_REDIRECT_URI: parsed.THREADS_REDIRECT_URI || `${parsed.BACKEND_URL.replace(/\/$/, '')}/api/auth/threads/callback`,
  MEDIA_PUBLIC_URL: parsed.MEDIA_PUBLIC_URL || `${parsed.BACKEND_URL.replace(/\/$/, '')}/uploads`,
  CORS_ORIGINS: parsed.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
};
