import { expect, test } from '@playwright/test';

test('opens the project scaffold', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ATLAS V0.1' })).toBeVisible();
  await expect(page.getByText('Project scaffold is running')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await navigator.serviceWorker.ready).active?.scriptURL,
      ),
    )
    .toContain('/sw.js');
});
