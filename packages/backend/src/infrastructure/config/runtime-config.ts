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
    AI_PROVIDER: z.enum(['fake', 'genapi']).default('fake'),
    FOOD_STORAGE_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    S3_ENDPOINT: z.url().default('http://localhost:9000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('atlas-private'),
    S3_ACCESS_KEY_ID: z.string().min(1).default('disabled'),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default('disabled'),
    S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
    IDENTITY_AI_PROVIDER_PROCESSING_VERSION: z.string().min(1).default('v1'),
    IDENTITY_AI_PROVIDER_DISCLOSURE: z
      .string()
      .min(1)
      .default('Сообщения будут обработаны внешним AI-провайдером.'),
    MARATHON_BOOTSTRAP_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    MARATHON_BOOTSTRAP_USER_IDS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      ),
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
    if (config.FOOD_STORAGE_ENABLED && (config.S3_ACCESS_KEY_ID === 'disabled' || config.S3_SECRET_ACCESS_KEY === 'disabled')) {
      context.addIssue({ code: 'custom', path: ['S3_ACCESS_KEY_ID'], message: 'Private S3 credentials are required when food storage is enabled' });
    }
  });

export const workerConfigSchema = baseSchema
  .extend({
    FOOD_FAKE_MODE: z.enum(['success', 'technicalError', 'outcomeUnknown']).default('success'),
    FOOD_VISION_PROVIDER: z.enum(['fake','genapi']).default('fake'),
    GENAPI_VISION_MODEL: z.string().min(1).optional(),
    GENAPI_NATIVE_BASE_URL: z.url().default('https://api.gen-api.ru/api/v1'),
    S3_ENDPOINT: z.url().default('http://localhost:9000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('atlas-private'),
    S3_ACCESS_KEY_ID: z.string().min(1).default('disabled'),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default('disabled'),
    S3_FORCE_PATH_STYLE: z.enum(['true','false']).default('true').transform((value)=>value==='true'),
    PUSH_ENABLED: z.enum(['true','false']).default('false').transform((value)=>value==='true'),
    PUSH_VAPID_SUBJECT: z.string().optional(),
    PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
    PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
    AI_FAKE_MODE: z
      .enum(['success', 'technicalError', 'outcomeUnknown'])
      .default('success'),
    AI_PROVIDER: z.enum(['fake', 'genapi']),
    IDENTITY_AI_PROVIDER_PROCESSING_VERSION: z.string().min(1).default('v1'),
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
    if (config.PUSH_ENABLED) {
      for (const key of ['PUSH_VAPID_SUBJECT','PUSH_VAPID_PUBLIC_KEY','PUSH_VAPID_PRIVATE_KEY'] as const)
        if (!config[key]) context.addIssue({code:'custom',path:[key],message:`${key} is required when PUSH_ENABLED=true`});
    }
    if (config.FOOD_VISION_PROVIDER === 'genapi') {
      if (!config.GENAPI_VISION_MODEL) context.addIssue({code:'custom',path:['GENAPI_VISION_MODEL'],message:'GENAPI_VISION_MODEL is required for GenAPI food vision'});
      if (!config.GENAPI_API_KEY || !config.GENAPI_BASE_URL) context.addIssue({code:'custom',path:['GENAPI_API_KEY'],message:'GenAPI credentials are required for food vision'});
      if (config.S3_ACCESS_KEY_ID === 'disabled' || config.S3_SECRET_ACCESS_KEY === 'disabled') context.addIssue({code:'custom',path:['S3_ACCESS_KEY_ID'],message:'Private S3 access is required for food vision'});
    }
  });

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;
