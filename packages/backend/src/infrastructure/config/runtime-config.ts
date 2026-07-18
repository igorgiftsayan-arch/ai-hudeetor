import { z } from 'zod';

const baseSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']).default('local'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  REDIS_URL: z.url(),
  REQUEST_ID_HEADER: z.string().min(1).default('x-request-id'),
});

export const apiConfigSchema = baseSchema.extend({
  API_CORS_ORIGIN: z.url().default('http://localhost:3000'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
});

export const workerConfigSchema = baseSchema.extend({
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3002),
  WORKER_QUEUE_NAME: z.string().min(1).default('atlas-system'),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;
