import { expect, test } from '@playwright/test';

const existingEmail = process.env.E2E_EXISTING_USER_EMAIL;
const existingPassword = process.env.E2E_EXISTING_USER_PASSWORD;

test.use({ serviceWorkers: 'block' });

test('existing completed user can return, update weight, use Daily Coach, and sign in again', async ({
  page,
}) => {
  test.skip(
    !existingEmail || !existingPassword,
    'Set E2E_EXISTING_USER_EMAIL and E2E_EXISTING_USER_PASSWORD to run against a seeded user.',
  );

  await page.goto('/login');
  await page.getByLabel('Email').fill(existingEmail!);
  await page.getByLabel('Пароль').fill(existingPassword!);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId('weight-summary')).toBeVisible();

  await page.getByRole('textbox', { name: 'Вес сегодня' }).fill('98,40');
  await page.getByRole('button', { name: 'Обновить вес' }).click();
  await expect(page.getByText('Вес за сегодня обновлён')).toBeVisible();
  await expect(page.getByTestId('weight-summary')).toContainText('98,40 кг');

  await page.getByRole('button', { name: 'Начать день' }).click();
  await expect(page.getByText('День начат')).toBeVisible();

  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(existingEmail!);
  await page.getByLabel('Пароль').fill(existingPassword!);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId('weight-summary')).toBeVisible();
});
