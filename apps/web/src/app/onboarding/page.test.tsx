import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from './page';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('technical onboarding flow', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          status: 'personaReady',
          completedSteps: ['profile', 'persona'],
          requiredSteps: ['completion'],
          canComplete: true,
          aiWellnessNoticeVersion: 'v1',
          csrfToken: 'csrf-token',
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reaches the personaReady completion state after profile and persona selection', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('button', { name: 'Бережный друг' }));

    expect(
      screen.getByText('Ваше состояние сохранено как personaReady.'),
    ).toBeInTheDocument();
  });

  it('redirects an already completed user to today', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          status: 'completed',
          completedSteps: ['profile', 'persona', 'completion'],
          requiredSteps: [],
          canComplete: false,
          aiWellnessNoticeVersion: 'v1',
          csrfToken: 'csrf-token',
        }),
      ),
    );

    render(<OnboardingPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
