'use client';

import { useEffect, useState } from 'react';

export type CaptainTaskDraft = {
  title: string;
  description: string;
};

export function CaptainTaskEditor({
  task,
  isSaving,
  error,
  onSave,
  onRetry,
}: {
  task?: CaptainTaskDraft;
  isSaving: boolean;
  error?: string;
  onSave: (task: CaptainTaskDraft) => void;
  onRetry?: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [validationError, setValidationError] = useState<string>();

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
  }, [task?.description, task?.title]);

  function submit() {
    const draft = { title: title.trim(), description: description.trim() };
    if (!draft.title || !draft.description) {
      setValidationError('Заполните название и описание задания.');
      return;
    }
    setValidationError(undefined);
    onSave(draft);
  }

  return (
    <section className="marathon-captain-editor" aria-labelledby="captain-editor-title">
      <p className="marathon-kicker">Капитан команды</p>
      <h2 id="captain-editor-title">Задание на сегодня</h2>
      <p>Команда увидит только это задание и свою отметку выполнения.</p>
      <label>
        <span>Название задания</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={isSaving} />
      </label>
      <label>
        <span>Описание задания</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={isSaving} rows={3} />
      </label>
      <button type="button" onClick={submit} disabled={isSaving}>
        {isSaving ? 'Сохраняем…' : 'Сохранить задание'}
      </button>
      {validationError && <p className="marathon-task-error" role="alert">{validationError}</p>}
      {error && <p className="marathon-task-error" role="alert">{error}{onRetry && <> <button type="button" onClick={onRetry}>Повторить</button></>}</p>}
    </section>
  );
}
