import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BACKEND_PORT: z.string().default('5000'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(10),
  FB_APP_ID: z.string(),
  FB_APP_SECRET: z.string(),
  FB_REDIRECT_URI: z.string(),
  ENCRYPTION_KEY: z.string().min(32),
});

export const env = envSchema.parse(process.env);
