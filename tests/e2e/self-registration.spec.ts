import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('new adult completes onboarding and can return after a fresh login', async ({
  page,
}) => {
  const email = `ui007-${Date.now()}@example.test`;
  const password = 'Ui007-password-42';

  await page.goto('/login');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('checkbox', { name: 'Мне уже есть 18 лет' }).check();
  await page
    .getByRole('checkbox', { name: 'Принимаю условия сервиса' })
    .check();
  await page
    .getByRole('checkbox', { name: 'Согласен с политикой конфиденциальности' })
    .check();
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Часовой пояс').fill('Asia/Irkutsk');
  await page
    .getByRole('checkbox', {
      name: 'Я понимаю, что сервис не заменяет медицинскую помощь, а AI может ошибаться.',
    })
    .check();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByRole('button', { name: 'Бережный друг' }).click();
  await page.getByRole('button', { name: 'Завершить настройку' }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId('weight-summary')).toBeVisible();

  await page.getByRole('textbox', { name: 'Вес сегодня' }).fill('84,24');
  await page.getByRole('button', { name: 'Записать вес' }).click();
  await expect(page.getByText('Вес за сегодня записан')).toBeVisible();

  await page.getByRole('button', { name: 'Начать день' }).click();
  await expect(page.getByText('День начат')).toBeVisible();
  await page.getByRole('button', { name: 'Завершить день' }).click();
  await expect(page.getByText('День завершён')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'На сегодня достаточно' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId('weight-summary')).toBeVisible();
});
