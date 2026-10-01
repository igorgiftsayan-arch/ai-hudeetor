import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodPhotoDraft } from './food-photo-draft';

const policy = {
  acceptedMimeTypes: ['image/jpeg', 'image/png'],
  maxBytes: 2_000_000,
};

describe('FoodPhotoDraft', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:meal-preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('shows its format and size limits before a file is selected', () => {
    render(<FoodPhotoDraft policy={policy} onReady={vi.fn()} />);

    expect(screen.getByText(/JPEG или PNG/)).toBeVisible();
    expect(screen.getByText(/до 2 МБ/)).toBeVisible();
    expect(screen.getByText('Файл пока не отправлен.')).toBeVisible();
  });

  it('rejects an unsupported file locally without starting the next step', () => {
    const onReady = vi.fn();
    render(<FoodPhotoDraft policy={policy} onReady={onReady} />);

    const file = new File(['not an image'], 'notes.txt', {
      type: 'text/plain',
    });
    fireEvent.change(screen.getByLabelText('Выбрать фото блюда'), {
      target: { files: [file] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Выберите изображение в формате JPEG или PNG.',
    );
    expect(onReady).not.toHaveBeenCalled();
  });

  it('drops a file whose image preview cannot be decoded', () => {
    const onReady = vi.fn();
    render(<FoodPhotoDraft policy={policy} onReady={onReady} />);

    const file = new File(['broken image bytes'], 'broken.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(screen.getByLabelText('Выбрать фото блюда'), {
      target: { files: [file] },
    });
    fireEvent.error(
      screen.getByRole('img', { name: 'Предпросмотр выбранного фото' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось открыть это изображение. Выберите другое.',
    );
    expect(onReady).not.toHaveBeenCalled();
  });

  it('previews a valid file and only hands it off after an explicit action', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<FoodPhotoDraft policy={policy} onReady={onReady} />);

    const file = new File(['meal'], 'lunch.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Выбрать фото блюда'), {
      target: { files: [file] },
    });

    expect(
      screen.getByRole('img', { name: 'Предпросмотр выбранного фото' }),
    ).toHaveAttribute('src', 'blob:meal-preview');
    expect(screen.getByText('lunch.jpg')).toBeVisible();
    expect(onReady).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledWith(file);
  });
});
