import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamLeaderboard } from './team-leaderboard';

describe('TeamLeaderboard', () => {
  it('renders server-provided daily leaders in the visual 2–1–3 podium order', () => {
    render(<TeamLeaderboard metrics={metrics()} teamName="Команда Антонины" />);

    const podium = screen.getByLabelText('Три лидера дня');
    expect(within(podium).getAllByTestId('marathon-podium-place')).toHaveLength(
      3,
    );
    expect(within(podium).getAllByTestId('marathon-podium-place')[0]).toHaveTextContent(
      'Игорь',
    );
    expect(within(podium).getAllByTestId('marathon-podium-place')[1]).toHaveTextContent(
      'Иван',
    );
    expect(within(podium).getAllByTestId('marathon-podium-place')[2]).toHaveTextContent(
      'Антонина',
    );
    expect(screen.getByText('Общий результат марафона пока под замком.')).toBeInTheDocument();
  });

  it('does not render a podium for binary captain task completion', async () => {
    const user = userEvent.setup();
    render(<TeamLeaderboard metrics={metrics()} teamName="Команда Антонины" />);

    await user.click(screen.getByRole('tab', { name: 'Задания' }));

    expect(screen.queryByLabelText('Три лидера дня')).not.toBeInTheDocument();
    expect(screen.getByText('Выполнено')).toBeInTheDocument();
    expect(screen.getByText('Пока нет отметки')).toBeInTheDocument();
  });

  it('keeps every participant visible when the server reports tied places', () => {
    render(
      <TeamLeaderboard
        teamName="Команда Антонины"
        metrics={[
          {
            id: 'weight',
            label: 'Отвес, %',
            legend: 'Результаты дня',
            kind: 'numeric',
            entries: [
              { id: 'one', name: 'Иван', value: '0,61 %', place: 1 },
              { id: 'two', name: 'Олег', value: '0,61 %', place: 1 },
              { id: 'three', name: 'Игорь', value: '0,36 %', place: 2 },
              { id: 'four', name: 'Антонина', value: '0,32 %', place: 3 },
            ],
          },
        ]}
      />,
    );

    expect(screen.queryByLabelText('Три лидера дня')).not.toBeInTheDocument();
    for (const name of ['Иван', 'Олег', 'Игорь', 'Антонина']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('forwards captain task completion without claiming that it was saved', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <TeamLeaderboard
        metrics={metrics()}
        teamName="Команда Антонины"
        captainTask={{
          title: 'Время для прогулки',
          description: 'Выделите сегодня время на прогулку.',
          completionLabel: 'Отметить выполнение',
          onComplete,
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Отметить выполнение' }));

    expect(onComplete).toHaveBeenCalledOnce();
    expect(screen.queryByText('Сохранено')).not.toBeInTheDocument();
  });
});

function metrics() {
  return [
    {
      id: 'weight' as const,
      label: 'Отвес, %',
      legend: 'Результаты дня',
      kind: 'numeric' as const,
      entries: [
        { id: 'one', name: 'Иван', value: '0,61 %', place: 1 },
        { id: 'two', name: 'Игорь', value: '0,36 %', place: 2 },
        { id: 'three', name: 'Антонина', value: '0,32 %', place: 3 },
        { id: 'four', name: 'Даша', value: '0,29 %', place: 4 },
      ],
    },
    {
      id: 'wellness' as const,
      label: 'Веллнес',
      legend: 'Веллнес индекс в сегодняшнем отчёте',
      kind: 'numeric' as const,
      entries: [],
    },
    {
      id: 'tasks' as const,
      label: 'Задания',
      legend: 'Сегодня: выполнено или пока нет отметки',
      kind: 'binary' as const,
      entries: [
        { id: 'one', name: 'Иван', status: 'completed' as const },
        { id: 'two', name: 'Игорь', status: 'pending' as const },
      ],
    },
  ];
}
