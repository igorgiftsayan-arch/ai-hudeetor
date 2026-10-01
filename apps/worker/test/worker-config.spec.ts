import { workerConfigSchema } from '@atlas/backend';

const base = {
  DATABASE_URL: 'postgresql://atlas:test@postgres:5432/atlas',
  REDIS_URL: 'redis://redis:6379/0',
  AI_FAKE_MODE: 'success',
  IDENTITY_EMAIL_PAYLOAD_SECRET:
    'test-email-payload-secret-at-least-32-characters',
  IDENTITY_AI_PROVIDER_PROCESSING_VERSION: 'test-v1',
};

describe('workerConfigSchema AI provider selection', () => {
  it('keeps fake configuration independent from GenAPI secrets', () => {
    expect(
      workerConfigSchema.parse({ ...base, AI_PROVIDER: 'fake' }),
    ).toMatchObject({
      AI_PROVIDER: 'fake',
    });
  });

  it('requires SMTP and HTTPS links in production', () => {
    expect(() =>
      workerConfigSchema.parse({
        ...base,
        APP_ENV: 'production',
        AI_PROVIDER: 'fake',
        EMAIL_TRANSPORT: 'fake',
        PUBLIC_WEB_URL: 'http://example.test',
      }),
    ).toThrow('SMTP email transport is required in production');
  });

  it('accepts Compose-provided empty GenAPI settings in fake mode', () => {
    expect(
      workerConfigSchema.parse({
        ...base,
        AI_PROVIDER: 'fake',
        GENAPI_API_KEY: '',
        GENAPI_BASE_URL: '',
        GENAPI_MODEL: '',
      }),
    ).toMatchObject({ AI_PROVIDER: 'fake' });
  });

  it('requires all GenAPI settings only for genapi', () => {
    expect(() =>
      workerConfigSchema.parse({ ...base, AI_PROVIDER: 'genapi' }),
    ).toThrow();
    expect(
      workerConfigSchema.parse({
        ...base,
        AI_PROVIDER: 'genapi',
        GENAPI_API_KEY: 'secret',
        GENAPI_BASE_URL: 'https://proxy.gen-api.ru/v1',
        GENAPI_MODEL: 'grok-4-5',
      }),
    ).toMatchObject({ AI_PROVIDER: 'genapi', GENAPI_MODEL: 'grok-4-5' });
  });
});
