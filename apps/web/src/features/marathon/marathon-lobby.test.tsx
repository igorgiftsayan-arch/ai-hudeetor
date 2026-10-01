import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarathonLobby } from './marathon-lobby';

const openEnrollment = {
  marathon: {
    id: 'marathon-1',
    name: 'Герби-Марафон',
    status: 'enrollmentOpen' as const,
    durationDays: 21,
    timezone: 'Asia/Irkutsk',
    startsOn: null,
    endsOn: null,
    enrollmentOpenedAt: '2026-10-01T08:00:00.000Z',
    enrollmentClosedAt: null,
    startedAt: null,
    completedAt: null,
  },
  enrollment: { isOpen: true, memberCount: 12 },
  currentMembership: null,
  canManage: false,
  canOpenEnrollment: false,
};

describe('MarathonLobby', () => {
  it('lets a user join an open enrollment without requesting an invitation code', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<MarathonLobby lobby={openEnrollment} onJoin={onJoin} />);

    expect(screen.getByRole('button', { name: 'Вступить в марафон' })).toBeEnabled();
    expect(screen.queryByLabelText(/код приглашения/i)).not.toBeInTheDocument();
    expect(screen.getByText('21 день')).toBeVisible();
    expect(screen.getByText('12 участников')).toBeVisible();
    expect(screen.queryByText('Лидеры дня')).not.toBeInTheDocument();
    expect(screen.queryByText('Отчёт за вчера')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вступить в марафон' }));
    expect(onJoin).toHaveBeenCalledOnce();
  });

  it('lets only a canOpenEnrollment captain set the duration and open enrollment', async () => {
    const user = userEvent.setup();
    const onOpenEnrollment = vi.fn();
    render(
      <MarathonLobby
        lobby={{
          marathon: null,
          enrollment: null,
          currentMembership: null,
          canManage: false,
          canOpenEnrollment: true,
        }}
        onOpenEnrollment={onOpenEnrollment}
      />,
    );

    const duration = screen.getByLabelText('Длительность, дней');
    await user.clear(duration);
    await user.type(duration, '0');
    await user.click(screen.getByRole('button', { name: 'Открыть набор' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Укажите длительность от 1 до 365 дней.',
    );
    expect(onOpenEnrollment).not.toHaveBeenCalled();

    await user.clear(duration);
    await user.type(duration, '28');
    await user.click(screen.getByRole('button', { name: 'Открыть набор' }));
    expect(onOpenEnrollment).toHaveBeenCalledWith(28);
  });

  it('keeps participants in waiting state after enrollment closes and gives only the captain a start action', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const closedEnrollment = {
      ...openEnrollment,
      marathon: {
        ...openEnrollment.marathon,
        status: 'enrollmentClosed' as const,
        enrollmentClosedAt: '2026-10-01T09:00:00.000Z',
      },
      enrollment: { isOpen: false, memberCount: 12 },
      currentMembership: { id: 'member-1', role: 'participant' as const },
    };

    const { rerender } = render(<MarathonLobby lobby={closedEnrollment} />);
    expect(screen.getByText('Набор завершён')).toBeVisible();
    expect(
      screen.getByText('Первый день начнётся, когда капитан его запустит.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Начать первый день' })).not.toBeInTheDocument();
    expect(screen.queryByText('Лидеры дня')).not.toBeInTheDocument();

    rerender(
      <MarathonLobby
        lobby={{ ...closedEnrollment, canManage: true, currentMembership: { id: 'captain-1', role: 'captain' } }}
        onStart={onStart}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Начать первый день' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('offers an allowlisted captain a new enrollment only after a marathon completes', () => {
    render(
      <MarathonLobby
        lobby={{
          ...openEnrollment,
          marathon: {
            ...openEnrollment.marathon,
            status: 'completed',
            startsOn: '2026-09-01',
            endsOn: '2026-09-21',
            startedAt: '2026-09-01T00:00:00.000Z',
            completedAt: '2026-09-21T00:00:00.000Z',
          },
          enrollment: null,
          currentMembership: { id: 'captain-1', role: 'captain' },
          canManage: true,
          canOpenEnrollment: true,
        }}
        onOpenEnrollment={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Марафон завершён' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Открыть новый набор' })).toBeEnabled();
  });
});
