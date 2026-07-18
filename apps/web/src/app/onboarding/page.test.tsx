import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from './page';

describe('technical onboarding flow', () => {
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
});
