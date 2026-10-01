import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PushPermissionCard } from './push-permission-card';

describe('PushPermissionCard', () => {
  it('does not request browser permission until the user explicitly asks', async () => {
    const user = userEvent.setup();
    const onRequestPermission = vi.fn();
    render(
      <PushPermissionCard
        capability="supported"
        permission="default"
        onRequestPermission={onRequestPermission}
      />,
    );

    expect(onRequestPermission).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Разрешить уведомления' }),
    );
    expect(onRequestPermission).toHaveBeenCalledOnce();
  });

  it('explains a denial without blocking the rest of the marathon', () => {
    render(
      <PushPermissionCard
        capability="supported"
        permission="denied"
        onRequestPermission={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Уведомления отключены в настройках браузера.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Разрешить уведомления' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer a permission request on an unsupported device', () => {
    render(
      <PushPermissionCard
        capability="unsupported"
        permission="default"
        onRequestPermission={vi.fn()}
      />,
    );

    expect(
      screen.getByText('На этом устройстве уведомления пока недоступны.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Разрешить уведомления' }),
    ).not.toBeInTheDocument();
  });
});
