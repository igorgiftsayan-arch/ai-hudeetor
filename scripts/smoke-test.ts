import { testServiceUrlsSchema } from '@atlas/test-kit';

const urls = testServiceUrlsSchema.parse({
  apiUrl:
    process.env.SMOKE_API_URL ?? 'http://127.0.0.1:3001/api/v1/health/ready',
  webUrl: process.env.SMOKE_WEB_URL ?? 'http://127.0.0.1:3000',
});

const checks = [
  ['web', urls.webUrl],
  ['api', urls.apiUrl],
] as const;

for (const [name, url] of checks) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok)
    throw new Error(`${name} smoke check failed with ${response.status}`);
  process.stdout.write(`${name} smoke check passed\n`);
}
