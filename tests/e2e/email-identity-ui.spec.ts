import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('verification fragment is not sent by GET and an explicit confirmation refreshes identity', async ({
  page,
}) => {
  const requests: { method: string; url: string }[] = [];
  let verifyCalls = 0;
  let currentUserCalls = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), url: request.url() });

    if (url.pathname === '/api/v1/users/me/onboarding')
      return route.fulfill({
        json: { status: 'registered', csrfToken: 'csrf' },
      });
    if (url.pathname === '/api/v1/email-verifications') {
      verifyCalls += 1;
      expect(request.method()).toBe('POST');
      expect(request.postDataJSON()).toEqual({ token: 'verification-token' });
      return route.fulfill({ status: 200, json: { emailVerified: true } });
    }
    if (url.pathname === '/api/v1/users/me') {
      currentUserCalls += 1;
      return route.fulfill({
        json: {
          userId: 'user-1',
          onboardingStatus: 'registered',
          emailVerified: true,
        },
      });
    }
    throw new Error(
      `Unexpected API request: ${request.method()} ${url.pathname}`,
    );
  });

  await page.goto('/verify-email?next=/onboarding#token=verification-token');
  await expect(page).toHaveURL(/\/verify-email\?next=\/onboarding$/);
  expect(verifyCalls).toBe(0);
  expect(
    requests.every((request) => !request.url.includes('verification-token')),
  ).toBe(true);

  await page.getByRole('button', { name: 'Подтвердить email' }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  expect(verifyCalls).toBe(1);
  expect(currentUserCalls).toBe(1);
});

test('invalid verification and password-reset links stay explicit and never expose fragment tokens to API URLs', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(request.url());
    if (url.pathname === '/api/v1/users/me/onboarding')
      return route.fulfill({
        status: 401,
        json: { error: { code: 'AUTHENTICATION_FAILED' } },
      });
    if (url.pathname === '/api/v1/email-verifications')
      return route.fulfill({
        status: 400,
        json: { error: { code: 'EMAIL_VERIFICATION_TOKEN_INVALID' } },
      });
    if (url.pathname === '/api/v1/password-resets') {
      expect(request.method()).toBe('POST');
      expect(request.postDataJSON()).toEqual({
        token: 'reset-token',
        newPassword: 'new-password-42',
      });
      return route.fulfill({ status: 200, json: { passwordReset: true } });
    }
    throw new Error(
      `Unexpected API request: ${request.method()} ${url.pathname}`,
    );
  });

  await page.goto('/verify-email#token=bad-token');
  await page.getByRole('button', { name: 'Подтвердить email' }).click();
  await expect(
    page.getByText('Ссылка недействительна или устарела. Запросите новое письмо.'),
  ).toBeVisible();

  await page.goto('/reset-password#token=reset-token');
  await page.locator('#new-password').fill('new-password-42');
  await page.getByRole('button', { name: 'Сохранить новый пароль' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    requests.every(
      (url) => !url.includes('bad-token') && !url.includes('reset-token'),
    ),
  ).toBe(true);
});

test('existing user can continue without AI and provider consent refreshes after a stale version without duplicate acceptance', async ({
  page,
}) => {
  let consentReads = 0;
  let consentWrites = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/users/me/onboarding')
      return route.fulfill({
        json: { status: 'completed', csrfToken: 'csrf' },
      });
    if (url.pathname === '/api/v1/ai-action-prices/quick-reply')
      return route.fulfill({
        json: { actionType: 'quickReply', priceTokens: 1, priceVersion: 1 },
      });
    if (url.pathname === '/api/v1/ai-conversations/current')
      return route.fulfill({ json: { id: 'conversation-1', messages: [] } });
    if (url.pathname === '/api/v1/ai/operations')
      return route.fulfill({
        status: 403,
        json: { error: { code: 'AI_PROVIDER_CONSENT_REQUIRED' } },
      });
    if (
      url.pathname === '/api/v1/users/me/ai-provider-consent' &&
      request.method() === 'GET'
    ) {
      consentReads += 1;
      return route.fulfill({
        json: {
          accepted: false,
          currentVersion: consentReads === 1 ? 'provider-v1' : 'provider-v2',
          acceptedVersion: null,
          disclosure:
            consentReads === 1
              ? 'Disclosure version one.'
              : 'Disclosure version two.',
        },
      });
    }
    if (
      url.pathname === '/api/v1/users/me/ai-provider-consent' &&
      request.method() === 'POST'
    ) {
      consentWrites += 1;
      expect(request.headers()['x-csrf-token']).toBe('csrf');
      expect(request.postDataJSON()).toEqual({
        documentVersion: 'provider-v1',
        accepted: true,
      });
      return route.fulfill({
        status: 409,
        json: { error: { code: 'CONSENT_VERSION_OUTDATED' } },
      });
    }
    throw new Error(
      `Unexpected API request: ${request.method()} ${url.pathname}`,
    );
  });

  await page.goto('/verify-email?next=/today');
  await page.getByRole('button', { name: 'Продолжить без AI' }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.goto('/quick-reply');
  await page.getByLabel('Сообщение').fill('Можно спросить?');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Disclosure version one.')).toBeVisible();

  const checkbox = page.getByRole('checkbox', {
    name: 'Я прочитал(а) информацию об обработке данных AI-провайдером',
  });
  await checkbox.check();
  await page.getByRole('button', { name: 'Продолжить с AI' }).dblclick();

  await expect(page.getByText('Disclosure version two.')).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  expect(consentWrites).toBe(1);
  expect(consentReads).toBe(2);
});
