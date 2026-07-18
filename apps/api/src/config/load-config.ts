import { apiConfigSchema, type ApiConfig } from '@atlas/backend';

const testDefaults = {
  DATABASE_URL: 'postgresql://atlas:atlas@localhost:5432/atlas_test',
  REDIS_URL: 'redis://localhost:6379/15',
  CSRF_SECRET: 'test-only-csrf-secret-at-least-32-characters',
  IDENTITY_TERMS_VERSION: 'test-v1',
  IDENTITY_PRIVACY_VERSION: 'test-v1',
};

export function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const useLocalDefaults =
    environment.NODE_ENV === 'test' ||
    environment.APP_ENV === undefined ||
    environment.APP_ENV === 'local';
  return apiConfigSchema.parse({
    ...(useLocalDefaults ? testDefaults : {}),
    ...environment,
  });
}
