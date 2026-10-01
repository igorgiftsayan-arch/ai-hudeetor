import { z } from 'zod';

const corsOriginSchema = z.url().transform((value, context) => {
  const url = new URL(value);
  const canonicalOrigin = url.origin;
  const explicitDefaultPort =
    url.protocol === 'https:'
      ? `${url.protocol}//${url.hostname}:443`
      : url.protocol === 'http:'
        ? `${url.protocol}//${url.hostname}:80`
        : undefined;

  if (value !== canonicalOrigin && value !== explicitDefaultPort) {
    context.addIssue({
      code: 'custom',
      message: 'API_CORS_ORIGIN must be a canonical origin',
    });
    return canonicalOrigin;
  }

  return canonicalOrigin;
});

const baseSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']).default('local'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  REDIS_URL: z.url(),
  REQUEST_ID_HEADER: z.string().min(1).default('x-request-id'),
});

export const apiConfigSchema = baseSchema
  .extend({
    AI_PROVIDER: z.enum(['fake', 'genapi']),
    API_CORS_ORIGIN: corsOriginSchema.default('http://localhost:3000'),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3001),
    API_TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
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
    IDENTITY_AI_PROVIDER_PROCESSING_VERSION: z.string().min(1),
    IDENTITY_AI_PROVIDER_PROCESSING_DISCLOSURE: z.string().min(40),
    IDENTITY_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    IDENTITY_LOGIN_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(900),
    IDENTITY_REGISTRATION_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    IDENTITY_REGISTRATION_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(3600),
    IDENTITY_EMAIL_PAYLOAD_SECRET: z.string().min(32),
    IDENTITY_EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(86_400),
    IDENTITY_PASSWORD_RESET_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(1_800),
    FOOD_VISION_PROVIDER: z.enum(['fake', 'genapi']).default('fake'),
    FOOD_STORAGE_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    S3_ENDPOINT: z.url().default('http://localhost:9000'),
    S3_PUBLIC_ENDPOINT: optionalEnvironmentValue(z.url()),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('atlas-private'),
    S3_ACCESS_KEY_ID: z.string().min(1).default('disabled'),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default('disabled'),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    PUSH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    PUSH_VAPID_PUBLIC_KEY: optionalEnvironmentValue(z.string().min(1)),
    MARATHON_BOOTSTRAP_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    MARATHON_BOOTSTRAP_USER_IDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
  })
  .superRefine((config, context) => {
    if (config.APP_ENV === 'production' && !config.IDENTITY_SECURE_COOKIES) {
      context.addIssue({
        code: 'custom',
        path: ['IDENTITY_SECURE_COOKIES'],
        message: 'Secure identity cookies are required in production',
      });
    }
    if (
      config.APP_ENV === 'production' &&
      !config.API_CORS_ORIGIN.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['API_CORS_ORIGIN'],
        message: 'HTTPS API_CORS_ORIGIN is required in production',
      });
    }
    if (config.APP_ENV === 'production' && config.API_TRUST_PROXY_HOPS < 1) {
      context.addIssue({
        code: 'custom',
        path: ['API_TRUST_PROXY_HOPS'],
        message: 'A trusted reverse proxy is required in production',
      });
    }
    if (
      config.FOOD_STORAGE_ENABLED &&
      (config.S3_ACCESS_KEY_ID === 'disabled' ||
        config.S3_SECRET_ACCESS_KEY === 'disabled')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY_ID'],
        message: 'Private S3 credentials are required when food storage is enabled',
      });
    }
    if (config.PUSH_ENABLED && !config.PUSH_VAPID_PUBLIC_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['PUSH_VAPID_PUBLIC_KEY'],
        message: 'PUSH_VAPID_PUBLIC_KEY is required when push is enabled',
      });
    }
  });

export const workerConfigSchema = baseSchema
  .extend({
    FOOD_FAKE_MODE: z
      .enum(['success', 'technicalError', 'outcomeUnknown'])
      .default('success'),
    FOOD_VISION_PROVIDER: z.enum(['fake', 'genapi']).default('fake'),
    GENAPI_VISION_MODEL: optionalEnvironmentValue(z.string().min(1)),
    GENAPI_VISION_MODEL_VERSION: z.string().min(1).default('gpt-4o-2024-08-06'),
    GENAPI_NATIVE_BASE_URL: z.url().default('https://api.gen-api.ru/api/v1'),
    S3_ENDPOINT: z.url().default('http://localhost:9000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('atlas-private'),
    S3_ACCESS_KEY_ID: z.string().min(1).default('disabled'),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default('disabled'),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    PUSH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    PUSH_VAPID_SUBJECT: optionalEnvironmentValue(z.string().min(1)),
    PUSH_VAPID_PUBLIC_KEY: optionalEnvironmentValue(z.string().min(1)),
    PUSH_VAPID_PRIVATE_KEY: optionalEnvironmentValue(z.string().min(1)),
    AI_FAKE_MODE: z
      .enum(['success', 'technicalError', 'outcomeUnknown'])
      .default('success'),
    AI_PROVIDER: z.enum(['fake', 'genapi']),
    GENAPI_API_KEY: optionalEnvironmentValue(z.string().min(1)),
    GENAPI_BASE_URL: optionalEnvironmentValue(z.url()),
    GENAPI_MODEL: optionalEnvironmentValue(z.string().min(1)),
    GENAPI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3002),
    WORKER_QUEUE_NAME: z.string().min(1).default('atlas-system'),
    IDENTITY_EMAIL_PAYLOAD_SECRET: z.string().min(32),
    PUBLIC_WEB_URL: corsOriginSchema.default('http://localhost:3000'),
    EMAIL_TRANSPORT: z.enum(['fake', 'smtp']).default('fake'),
    SMTP_HOST: optionalEnvironmentValue(z.string().min(1)),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    SMTP_USER: optionalEnvironmentValue(z.string().min(1)),
    SMTP_PASSWORD: optionalEnvironmentValue(z.string().min(1)),
    SMTP_FROM: optionalEnvironmentValue(z.string().min(3)),
    IDENTITY_AI_PROVIDER_PROCESSING_VERSION: z.string().min(1),
  })
  .superRefine((config, context) => {
    if (config.AI_PROVIDER === 'genapi') {
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
    }
    if (config.EMAIL_TRANSPORT === 'smtp') {
      for (const key of [
        'SMTP_HOST',
        'SMTP_USER',
        'SMTP_PASSWORD',
        'SMTP_FROM',
      ] as const) {
        if (!config[key])
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when EMAIL_TRANSPORT=smtp`,
          });
      }
    }
    if (config.APP_ENV === 'production' && config.EMAIL_TRANSPORT !== 'smtp') {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_TRANSPORT'],
        message: 'SMTP email transport is required in production',
      });
    }
    if (
      config.APP_ENV === 'production' &&
      !config.PUBLIC_WEB_URL.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_WEB_URL'],
        message: 'HTTPS PUBLIC_WEB_URL is required in production',
      });
    }
    if (config.FOOD_VISION_PROVIDER === 'genapi') {
      for (const key of [
        'GENAPI_API_KEY',
        'GENAPI_NATIVE_BASE_URL',
        'GENAPI_VISION_MODEL',
      ] as const) {
        if (!config[key])
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when FOOD_VISION_PROVIDER=genapi`,
          });
      }
    }
    if (config.PUSH_ENABLED) {
      for (const key of [
        'PUSH_VAPID_SUBJECT',
        'PUSH_VAPID_PUBLIC_KEY',
        'PUSH_VAPID_PRIVATE_KEY',
      ] as const) {
        if (!config[key])
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when PUSH_ENABLED=true`,
          });
      }
    }
  });

function optionalEnvironmentValue<T extends z.ZodType<string>>(schema: T) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );
}

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;
