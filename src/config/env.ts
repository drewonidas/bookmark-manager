import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  AUTH_TOKEN: z.string().min(8, 'AUTH_TOKEN must be at least 8 characters long').default('sanctuary-secret-token-change-me'),
  DATABASE_URL: z.string().url(),
  GEMINI_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
