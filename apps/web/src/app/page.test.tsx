import { render, screen } from '@testing-library/react';
import HomePage from './page';

describe('health page', () => {
  it('renders the technical readiness status', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', { name: 'ATLAS V0.1' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Project scaffold is running')).toBeInTheDocument();
  });
});
