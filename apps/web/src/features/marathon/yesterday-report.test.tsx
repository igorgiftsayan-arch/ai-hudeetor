import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YesterdayReport } from './yesterday-report';

describe('YesterdayReport', () => {
  it('submits only the selected server-provided habit ids for yesterday', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <YesterdayReport
        dateLabel="Вчера, 23 сентября"
        items={items()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Норма воды' }));
    await user.click(screen.getByRole('button', { name: 'Отправить отчёт' }));

    expect(onSave).toHaveBeenCalledWith(['water']);
    expect(screen.queryByText('Сохранено')).not.toBeInTheDocument();
  });

  it('allows correction of an existing report without changing its date', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <YesterdayReport
        dateLabel="Вчера, 23 сентября"
        items={items(['morning-shake'])}
        onSave={onSave}
        mode="update"
      />,
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'Утренний коктейль' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Хороший сон' }));
    await user.click(screen.getByRole('button', { name: 'Обновить отчёт' }));

    expect(onSave).toHaveBeenCalledWith(['sleep']);
    expect(screen.getByText('Вчера, 23 сентября')).toBeInTheDocument();
  });

  it('renders the eight standard habits as binary choices', () => {
    render(<YesterdayReport dateLabel="Вчера" items={items()} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByText('Отмечено 0 из 8')).toBeInTheDocument();
  });
});

function items(selectedIds: string[] = []) {
  return [
    { id: 'morning-shake', label: 'Утренний коктейль' },
    { id: 'activity', label: 'Физическая активность' },
    { id: 'water', label: 'Норма воды' },
    { id: 'second-shake', label: 'Второй коктейль' },
    { id: 'healthy-dinner', label: 'Здоровый ужин' },
    { id: 'sleep', label: 'Хороший сон' },
    { id: 'no-junk-food', label: 'Никакой вредной еды' },
    { id: 'no-smoking', label: 'Никакого курения' },
  ].map((item) => ({ ...item, checked: selectedIds.includes(item.id) }));
}
