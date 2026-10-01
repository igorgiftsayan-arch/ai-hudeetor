import { loadApiConfig } from '../src/config/load-config';

const identityEmailConfig = {
  IDENTITY_AI_PROVIDER_PROCESSING_VERSION: 'v1',
  IDENTITY_AI_PROVIDER_PROCESSING_DISCLOSURE:
    'Production disclosure for external AI provider processing and privacy.',
  IDENTITY_EMAIL_PAYLOAD_SECRET:
    'production-email-secret-at-least-32-characters',
};

describe('Identity production configuration', () => {
  it('rejects insecure identity cookies in production', () => {
    expect(() =>
      loadApiConfig({
        ...identityEmailConfig,
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

  it('rejects a non-HTTPS browser origin in production', () => {
    expect(() =>
      loadApiConfig({
        ...identityEmailConfig,
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://atlas:test@postgres:5432/atlas',
        REDIS_URL: 'redis://redis:6379/0',
        API_CORS_ORIGIN: 'http://example.test',
        API_TRUST_PROXY_HOPS: '1',
        CSRF_SECRET: 'production-secret-at-least-32-characters',
        IDENTITY_TERMS_VERSION: 'v1',
        IDENTITY_PRIVACY_VERSION: 'v1',
        IDENTITY_AI_WELLNESS_NOTICE_VERSION: 'v1',
        IDENTITY_SECURE_COOKIES: 'true',
      }),
    ).toThrow('HTTPS API_CORS_ORIGIN is required in production');
  });

  it.each([
    'https://example.test/',
    'https://example.test/unintended-path',
    'https://example.test?unexpected=query',
  ])('rejects a non-canonical browser origin in production: %s', (origin) => {
    expect(() =>
      loadApiConfig({
        ...identityEmailConfig,
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://atlas:test@postgres:5432/atlas',
        REDIS_URL: 'redis://redis:6379/0',
        API_CORS_ORIGIN: origin,
        API_TRUST_PROXY_HOPS: '1',
        CSRF_SECRET: 'production-secret-at-least-32-characters',
        IDENTITY_TERMS_VERSION: 'v1',
        IDENTITY_PRIVACY_VERSION: 'v1',
        IDENTITY_AI_WELLNESS_NOTICE_VERSION: 'v1',
        IDENTITY_SECURE_COOKIES: 'true',
      }),
    ).toThrow('API_CORS_ORIGIN must be a canonical origin');
  });

  it('normalizes an explicit HTTPS default port to the browser origin', () => {
    expect(
      loadApiConfig({
        ...identityEmailConfig,
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://atlas:test@postgres:5432/atlas',
        REDIS_URL: 'redis://redis:6379/0',
        API_CORS_ORIGIN: 'https://example.test:443',
        API_TRUST_PROXY_HOPS: '1',
        CSRF_SECRET: 'production-secret-at-least-32-characters',
        IDENTITY_TERMS_VERSION: 'v1',
        IDENTITY_PRIVACY_VERSION: 'v1',
        IDENTITY_AI_WELLNESS_NOTICE_VERSION: 'v1',
        IDENTITY_SECURE_COOKIES: 'true',
      }).API_CORS_ORIGIN,
    ).toBe('https://example.test');
  });

  it('requires a trusted reverse-proxy hop in production', () => {
    expect(() =>
      loadApiConfig({
        ...identityEmailConfig,
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://atlas:test@postgres:5432/atlas',
        REDIS_URL: 'redis://redis:6379/0',
        API_CORS_ORIGIN: 'https://example.test',
        API_TRUST_PROXY_HOPS: '0',
        CSRF_SECRET: 'production-secret-at-least-32-characters',
        IDENTITY_TERMS_VERSION: 'v1',
        IDENTITY_PRIVACY_VERSION: 'v1',
        IDENTITY_AI_WELLNESS_NOTICE_VERSION: 'v1',
        IDENTITY_SECURE_COOKIES: 'true',
      }),
    ).toThrow('A trusted reverse proxy is required in production');
  });
});
