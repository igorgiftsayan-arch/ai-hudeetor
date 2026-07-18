import { apiConfigSchema, type ApiConfig } from '@atlas/backend';

const testDefaults = {
  DATABASE_URL: 'postgresql://atlas:atlas@localhost:5432/atlas_test',
  REDIS_URL: 'redis://localhost:6379/15',
};

export function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  return apiConfigSchema.parse({ ...testDefaults, ...environment });
}
