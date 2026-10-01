import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FoodConfirmation } from './food-confirmation';

const analysis = {
  items: ['гречка', 'овощи'],
  suitability: 'Недостаточно данных о ваших правилах питания.',
};

describe('FoodConfirmation', () => {
  it('keeps an analysed meal out of the diary until the user confirms it', () => {
    const onConfirm = vi.fn();
    render(
      <FoodConfirmation
        analysis={analysis}
        now="2026-09-24T09:30"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Анализ не добавлен в дневник')).toBeVisible();
    expect(screen.getByText('гречка, овощи')).toBeVisible();
    expect(screen.getByText(analysis.suitability)).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('allows correction before explicit confirmation with a chosen local date and time', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <FoodConfirmation
        analysis={analysis}
        now="2026-09-24T09:30"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Исправить состав' }));
    const composition = screen.getByLabelText('Состав блюда');
    await user.clear(composition);
    await user.type(composition, 'гречка, овощи, курица');
    await user.click(screen.getByRole('button', { name: 'Съели это?' }));

    expect(screen.getByLabelText('Дата')).toHaveValue('2026-09-24');
    expect(screen.getByLabelText('Время')).toHaveValue('09:30');
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Подтвердить употребление' }),
    );

    expect(onConfirm).toHaveBeenCalledWith({
      items: ['гречка', 'овощи', 'курица'],
      consumedAt: '2026-09-24T09:30',
    });
  });

  it('hides the original assessment as soon as composition changes and restores it only for the assessed composition', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <FoodConfirmation
        analysis={analysis}
        now="2026-09-24T09:30"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Исправить состав' }));
    const composition = screen.getByLabelText('Состав блюда');
    await user.clear(composition);
    await user.type(composition, 'рыба');
    expect(screen.queryByText(analysis.suitability)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Исправленный состав пока не оценён/),
    ).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();
    await user.clear(composition);
    await user.type(composition, 'гречка, овощи');
    expect(screen.getByText(analysis.suitability)).toBeVisible();
    expect(
      screen.queryByText(/Исправленный состав пока не оценён/),
    ).not.toBeInTheDocument();
  });

  it('marks already confirmed data without offering another confirmation', () => {
    render(
      <FoodConfirmation
        analysis={analysis}
        now="2026-09-24T09:30"
        status="confirmed"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Добавлено в дневник')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Съели это?' }),
    ).not.toBeInTheDocument();
  });
});
