'use client';

import { useState } from 'react';

export type YesterdayReportItem = {
  id: string;
  label: string;
  checked: boolean;
};

export function YesterdayReport({
  dateLabel,
  items,
  mode = 'create',
  isSaving = false,
  error,
  onSave,
}: {
  dateLabel: string;
  items: YesterdayReportItem[];
  mode?: 'create' | 'update';
  isSaving?: boolean;
  error?: string;
  onSave?: (selectedIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(items.filter((item) => item.checked).map((item) => item.id)),
  );

  const selectedCount = selectedIds.size;
  const actionLabel =
    mode === 'update' ? 'Обновить отчёт' : 'Отправить отчёт';

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section
      className="marathon-report"
      aria-labelledby="marathon-report-title"
    >
      <div className="marathon-report-heading">
        <div>
          <p className="marathon-kicker">Отчёт за вчера</p>
          <h2 id="marathon-report-title">{dateLabel}</h2>
        </div>
        <span className="marathon-report-count" aria-live="polite">
          Отмечено {selectedCount} из {items.length}
        </span>
      </div>

      <p className="marathon-report-intro">
        Отметьте то, что было вчера. Отчёт можно исправить.
      </p>

      <fieldset className="marathon-habit-list" disabled={isSaving}>
        <legend className="sr-only">Отметки за вчера</legend>
        {items.map((item) => (
          <label key={item.id} className="marathon-habit">
            <input
              type="checkbox"
              checked={selectedIds.has(item.id)}
              onChange={() => toggle(item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className="marathon-report-action"
        disabled={!onSave || isSaving}
        onClick={() => onSave?.([...selectedIds])}
      >
        {isSaving ? 'Сохраняем…' : actionLabel}
      </button>
      {error && (
        <p className="marathon-task-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
