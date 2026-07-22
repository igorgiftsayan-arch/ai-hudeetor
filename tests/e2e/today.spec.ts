import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';
const webOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:3100';

test('completed user records weight on today and opens quick reply', async ({
  context,
  page,
}) => {
  const email = `ui001-${Date.now()}@example.com`;
  const password = 'UI001-test-password-42';
  const headers = { Origin: webOrigin };

  const registration = await context.request.post(`${apiBase}/registrations`, {
    headers: {
      ...headers,
      'Idempotency-Key': `ui001-registration-${Date.now()}`,
    },
    data: {
      email,
      password,
      ageConfirmed: true,
      consents: [
        { consentType: 'terms', documentVersion: 'test-v1', accepted: true },
        { consentType: 'privacy', documentVersion: 'test-v1', accepted: true },
      ],
    },
  });
  expect(registration.status()).toBe(201);
  const registrationBody = (await registration.json()) as { csrfToken: string };
  const mutationHeaders = {
    ...headers,
    'X-CSRF-Token': registrationBody.csrfToken,
  };

  const profile = await context.request.patch(`${apiBase}/users/me/profile`, {
    headers: mutationHeaders,
    data: {
      timezone: 'Asia/Irkutsk',
      consents: [
        {
          consentType: 'aiWellnessNotice',
          documentVersion: 'test-v1',
          accepted: true,
        },
      ],
    },
  });
  expect(profile.status()).toBe(200);

  const persona = await context.request.put(
    `${apiBase}/users/me/ai-preference`,
    {
      headers: mutationHeaders,
      data: {
        personaId: 'gentleFriend',
        strictness: 'low',
        responseLength: 'short',
      },
    },
  );
  expect(persona.status()).toBe(200);

  const completion = await context.request.post(
    `${apiBase}/users/me/onboarding-completions`,
    {
      headers: {
        ...mutationHeaders,
        'Idempotency-Key': `ui001-completion-${Date.now()}`,
      },
    },
  );
  expect(completion.status()).toBe(201);

  await page.goto('/today');
  await expect(
    page.getByText(
      'Здесь появятся ваши изменения. Начните с сегодняшнего веса.',
    ),
  ).toBeVisible();

  await page.getByRole('textbox', { name: 'Вес сегодня' }).fill('98,4');
  await page.getByRole('button', { name: 'Сохранить вес' }).click();
  await expect(page.getByText('Записано')).toBeVisible();
  await expect(page.getByTestId('weight-summary')).toContainText('98,4 кг');

  await page.reload();
  await expect(page.getByTestId('weight-summary')).toContainText('98,4 кг');
  await page.getByRole('link', { name: 'Поговорить с AI' }).click();
  await expect(page).toHaveURL(/\/quick-reply$/);
});
