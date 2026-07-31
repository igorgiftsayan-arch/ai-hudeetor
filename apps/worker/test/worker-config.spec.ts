import { workerConfigSchema } from '@atlas/backend';

const base = {
  DATABASE_URL: 'postgresql://atlas:test@postgres:5432/atlas',
  REDIS_URL: 'redis://redis:6379/0',
  AI_FAKE_MODE: 'success',
};

describe('workerConfigSchema AI provider selection', () => {
  it('keeps fake configuration independent from GenAPI secrets', () => {
    expect(workerConfigSchema.parse({ ...base, AI_PROVIDER: 'fake' })).toMatchObject({
      AI_PROVIDER: 'fake',
    });
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
