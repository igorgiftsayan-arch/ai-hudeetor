import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamLeaderboard, type MarathonMetric } from './team-leaderboard';

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
    expect(screen.queryByText('Пока нет отметки')).not.toBeInTheDocument();
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
            podiums: [
              {
                place: 1,
                value: '0,61 %',
                members: [
                  { id: 'one', name: 'Иван' },
                  { id: 'two', name: 'Олег' },
                ],
              },
              {
                place: 2,
                value: '0,36 %',
                members: [{ id: 'three', name: 'Игорь' }],
              },
              {
                place: 3,
                value: '0,32 %',
                members: [{ id: 'four', name: 'Антонина' }],
              },
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

  it('renders a server-provided shared podium place without choosing one winner', () => {
    render(
      <TeamLeaderboard
        teamName="Команда Антонины"
        metrics={[
          {
            id: 'weight',
            label: 'Отвес, %',
            legend: 'Разница между вчерашним и сегодняшним весом.',
            kind: 'numeric',
            podiums: [
              {
                place: 1,
                value: '1 %',
                members: [
                  { id: 'one', name: 'Иван' },
                  { id: 'two', name: 'Олег', isCurrentUser: true },
                ],
              },
              {
                place: 2,
                value: '0 %',
                members: [{ id: 'three', name: 'Антонина' }],
              },
            ],
          },
        ]}
      />,
    );

    const leaders = screen.getByLabelText('Лидеры дня: Отвес, %');
    expect(within(leaders).getByText('Иван')).toBeInTheDocument();
    expect(within(leaders).getByText('Олег')).toBeInTheDocument();
    expect(within(leaders).getByText('Антонина')).toBeInTheDocument();
    expect(within(leaders).getByText('1')).toBeInTheDocument();
    expect(within(leaders).getByText('2')).toBeInTheDocument();
    expect(within(leaders).getByText('1 %')).toBeInTheDocument();
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

function metrics(): MarathonMetric[] {
  return [
    {
      id: 'weight' as const,
      label: 'Отвес, %',
      legend: 'Результаты дня',
      kind: 'numeric' as const,
      podiums: [
        { place: 1, value: '0,61 %', members: [{ id: 'one', name: 'Иван' }] },
        { place: 2, value: '0,36 %', members: [{ id: 'two', name: 'Игорь' }] },
        { place: 3, value: '0,32 %', members: [{ id: 'three', name: 'Антонина' }] },
      ],
    },
    {
      id: 'wellness' as const,
      label: 'Веллнес',
      legend: 'Веллнес индекс в сегодняшнем отчёте',
      kind: 'numeric' as const,
      podiums: [],
    },
    {
      id: 'tasks' as const,
      label: 'Задания',
      legend: 'Сегодня: выполнено или пока нет отметки',
      kind: 'binary' as const,
      podiums: [
        {
          place: 1,
          value: 'Выполнено' as const,
          members: [{ id: 'one', name: 'Иван' }],
        },
      ],
    },
  ];
}
