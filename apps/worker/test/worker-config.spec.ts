import { workerConfigSchema } from '@atlas/backend';

const base = {
  DATABASE_URL: 'postgresql://atlas:test@postgres:5432/atlas',
  REDIS_URL: 'redis://redis:6379/0',
  AI_FAKE_MODE: 'success',
};

describe('workerConfigSchema AI provider selection', () => {
  it('keeps fake configuration independent from GenAPI secrets', () => {
    expect(
      workerConfigSchema.parse({ ...base, AI_PROVIDER: 'fake' }),
    ).toMatchObject({
      AI_PROVIDER: 'fake',
    });
  });

  it('accepts Compose empty optional GenAPI values for a fake worker but still rejects missing real-provider settings', () => {
    const empty = {
      ...base,
      GENAPI_API_KEY: '',
      GENAPI_BASE_URL: '',
      GENAPI_MODEL: '',
    };
    expect(
      workerConfigSchema.parse({ ...empty, AI_PROVIDER: 'fake' }),
    ).toMatchObject({
      AI_PROVIDER: 'fake',
      GENAPI_API_KEY: undefined,
      GENAPI_BASE_URL: undefined,
      GENAPI_MODEL: undefined,
    });
    expect(() =>
      workerConfigSchema.parse({ ...empty, AI_PROVIDER: 'genapi' }),
    ).toThrow();
    expect(() =>
      workerConfigSchema.parse({
        ...empty,
        AI_PROVIDER: 'fake',
        GENAPI_BASE_URL: 'not-a-url',
      }),
    ).toThrow();
  });

  it('validates real food and enabled push independently of a fake chat provider', () => {
    expect(() =>
      workerConfigSchema.parse({
        ...base,
        AI_PROVIDER: 'fake',
        FOOD_VISION_PROVIDER: 'genapi',
      }),
    ).toThrow();
    expect(() =>
      workerConfigSchema.parse({
        ...base,
        AI_PROVIDER: 'fake',
        PUSH_ENABLED: 'true',
      }),
    ).toThrow();
    expect(
      workerConfigSchema.parse({
        ...base,
        AI_PROVIDER: 'fake',
        FOOD_VISION_PROVIDER: 'genapi',
        GENAPI_API_KEY: 'test',
        GENAPI_BASE_URL: 'https://provider.example/v1',
        GENAPI_VISION_MODEL: 'gpt-4o',
        S3_ACCESS_KEY_ID: 'test',
        S3_SECRET_ACCESS_KEY: 'test',
      }),
    ).toMatchObject({ AI_PROVIDER: 'fake', FOOD_VISION_PROVIDER: 'genapi' });
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
