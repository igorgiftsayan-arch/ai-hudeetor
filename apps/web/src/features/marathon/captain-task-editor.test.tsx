import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptainTaskEditor } from './captain-task-editor';

describe('CaptainTaskEditor', () => {
  it('sends the captain task only after title and description are entered', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CaptainTaskEditor isSaving={false} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Сохранить задание' }));
    expect(screen.getByText('Заполните название и описание задания.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Название задания'), 'Прогулка');
    await user.type(screen.getByLabelText('Описание задания'), 'Пройдите 20 минут пешком.');
    await user.click(screen.getByRole('button', { name: 'Сохранить задание' }));

    expect(onSave).toHaveBeenCalledWith({
      title: 'Прогулка',
      description: 'Пройдите 20 минут пешком.',
    });
  });

  it('uses the existing task as an editable draft', () => {
    render(
      <CaptainTaskEditor
        isSaving={false}
        task={{ title: 'Прогулка', description: 'Пройдите 20 минут пешком.' }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Название задания')).toHaveValue('Прогулка');
    expect(screen.getByLabelText('Описание задания')).toHaveValue('Пройдите 20 минут пешком.');
  });
});
