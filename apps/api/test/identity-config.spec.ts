import { loadApiConfig } from '../src/config/load-config';

describe('Identity production configuration', () => {
  it('rejects insecure identity cookies in production', () => {
    expect(() =>
      loadApiConfig({
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://atlas:test@localhost:5432/atlas',
        REDIS_URL: 'redis://localhost:6379/0',
        CSRF_SECRET: 'production-secret-at-least-32-characters',
        IDENTITY_TERMS_VERSION: 'v1',
        IDENTITY_PRIVACY_VERSION: 'v1',
        IDENTITY_AI_WELLNESS_NOTICE_VERSION: 'v1',
        IDENTITY_SECURE_COOKIES: 'false',
      }),
    ).toThrow('Secure identity cookies are required in production');
  });
});
