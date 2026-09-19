import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BACKEND_PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(10).default('supersecretjwtkeyforinstacommand2026jwt'),
  FB_APP_ID: z.string().default('1234567890'),
  FB_APP_SECRET: z.string().default('default_meta_app_secret_placeholder'),
  FB_REDIRECT_URI: z.string().default('http://api-instacommand.179.198.98.63.sslip.io/api/auth/facebook/callback'),
  // 64 hex characters = 32 bytes for aes-256
  ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
});

export const env = envSchema.parse(process.env);
