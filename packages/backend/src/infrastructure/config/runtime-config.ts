import { z } from 'zod';

const baseSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']).default('local'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  REDIS_URL: z.url(),
  REQUEST_ID_HEADER: z.string().min(1).default('x-request-id'),
});

export const apiConfigSchema = baseSchema
  .extend({
    API_CORS_ORIGIN: z.url().default('http://localhost:3000'),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3001),
    CSRF_SECRET: z.string().min(32),
    IDENTITY_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(900),
    IDENTITY_REFRESH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(2_592_000),
    IDENTITY_SECURE_COOKIES: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    IDENTITY_TERMS_VERSION: z.string().min(1),
    IDENTITY_PRIVACY_VERSION: z.string().min(1),
    IDENTITY_AI_WELLNESS_NOTICE_VERSION: z.string().min(1),
    IDENTITY_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    IDENTITY_LOGIN_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(900),
  })
  .superRefine((config, context) => {
    if (config.APP_ENV === 'production' && !config.IDENTITY_SECURE_COOKIES) {
      context.addIssue({
        code: 'custom',
        path: ['IDENTITY_SECURE_COOKIES'],
        message: 'Secure identity cookies are required in production',
      });
    }
  });

export const workerConfigSchema = baseSchema
  .extend({
    AI_FAKE_MODE: z
      .enum(['success', 'technicalError', 'outcomeUnknown'])
      .default('success'),
    AI_PROVIDER: z.enum(['fake', 'genapi']),
    GENAPI_API_KEY: z.string().min(1).optional(),
    GENAPI_BASE_URL: z.url().optional(),
    GENAPI_MODEL: z.string().min(1).optional(),
    GENAPI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3002),
    WORKER_QUEUE_NAME: z.string().min(1).default('atlas-system'),
  })
  .superRefine((config, context) => {
    if (config.AI_PROVIDER !== 'genapi') return;
    for (const key of [
      'GENAPI_API_KEY',
      'GENAPI_BASE_URL',
      'GENAPI_MODEL',
    ] as const) {
      if (!config[key])
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when AI_PROVIDER=genapi`,
        });
    }
  });

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;
