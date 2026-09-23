import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

for (const width of [320, 390]) {
  test(`marathon fixture renders at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const json = (body: unknown, status = 200) => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      if (url.pathname === '/api/v1/users/me/onboarding') {
        return json({ status: 'completed', csrfToken: 'fixture-csrf', profile: {} });
      }
      if (url.pathname === '/api/v1/marathons/current') {
        return json({
          marathon: { id: 'fixture-marathon', name: 'Герби-Марафон', startsOn: '2026-09-28', endsOn: '2026-10-11', timezone: 'Asia/Irkutsk' },
          team: { id: 'fixture-team', name: 'Команда Антонины' },
          membership: { id: 'fixture-membership', role: 'participant', isCurrentUser: true },
          displayDate: '2026-09-29',
          reportDate: '2026-09-28',
        });
      }
      if (url.pathname === '/api/v1/marathon-wellness-reports/2026-09-28') {
        return json({ status: 'unknown', reportDate: '2026-09-28', report: null });
      }
      if (url.pathname === '/api/v1/marathon-teams/current/today') {
        return json({
          displayDate: '2026-09-29', reportDate: '2026-09-28',
          team: { id: 'fixture-team', name: 'Команда Антонины' },
          currentMembership: { id: 'fixture-membership', role: 'participant', isCurrentUser: true },
          captainTask: { id: 'fixture-task', taskDate: '2026-09-29', title: 'Прогулка после ужина', description: 'Пройдите спокойно 20 минут.', currentUserCompletion: { status: 'unknown', updatedAt: null } },
          members: [
            { membershipId: 'fixture-membership', displayName: 'Игорь', role: 'participant', isCurrentUser: true, weight: { status: 'unknown', dailyPercent: null }, wellness: { status: 'unknown', markedCount: null }, captainTask: { status: 'unknown' } },
            { membershipId: 'second-member', displayName: 'Антонина', role: 'captain', isCurrentUser: false, weight: { status: 'unknown', dailyPercent: null }, wellness: { status: 'reported', markedCount: 5 }, captainTask: { status: 'completed' } },
          ],
          podiums: { weight: [], wellness: [], captainTask: [] },
        });
      }
      if (url.pathname === '/api/v1/users/me/ai-provider-consent') {
        return json({ providerMode: 'fake', externalProviderEnabled: false, documentVersion: 'fixture-v1', disclosure: 'Тестовый режим.', accepted: false, acceptedAt: null });
      }
      return json({ error: { code: 'UNEXPECTED_FIXTURE_REQUEST' } }, 500);
    });

    await page.goto('/marathon');
    await expect(page.getByRole('heading', { name: 'Сегодня на пьедестале.' })).toBeVisible();
    await expect(page.getByText('Команда Антонины')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Поговорить с AI' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отправить отчёт' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`marathon-${width}.png`), fullPage: true });
  });
}
