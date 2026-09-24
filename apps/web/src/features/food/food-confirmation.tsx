'use client';

import { useState } from 'react';
import type { FoodSuitabilityResultDto } from '@atlas/api-contracts';

export type FoodAnalysisView = {
  items: readonly string[];
  suitability: string;
  suitabilityStatus?: FoodSuitabilityResultDto['status'];
  missingData?: readonly string[];
  assessedItems?: readonly string[];
};

const suitabilityLabels = {
  matches: 'Соответствует',
  doesNotMatch: 'Не соответствует',
  mixed: 'Частично соответствует',
  insufficientData: 'Недостаточно данных',
} satisfies Record<FoodSuitabilityResultDto['status'], string>;

export type ConfirmedFoodDraft = {
  items: string[];
  consumedAt: string;
};

function splitLocalDateTime(value: string) {
  const [date = '', time = ''] = value.slice(0, 16).split('T');
  return { date, time };
}

function parseItems(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Presentation-only confirmation boundary. The parent later maps this view
 * model to the server DTO; no diary record is created inside this component.
 */
export function FoodConfirmation({
  analysis,
  now,
  status = 'unconfirmed',
  onConfirm,
}: {
  analysis: FoodAnalysisView;
  now: string;
  status?: 'unconfirmed' | 'confirmed';
  onConfirm: (draft: ConfirmedFoodDraft) => void;
}) {
  const [composition, setComposition] = useState(analysis.items.join(', '));
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string>();

  function openConfirmation() {
    const initial = splitLocalDateTime(now);
    setDate(initial.date);
    setTime(initial.time);
    setConfirming(true);
    setError(undefined);
  }

  function confirm() {
    const items = parseItems(composition);
    if (!items.length) {
      setError('Укажите хотя бы один продукт или блюдо.');
      return;
    }
    if (!date || !time) {
      setError('Выберите дату и время употребления.');
      return;
    }
    onConfirm({ items, consumedAt: `${date}T${time}` });
  }

  const isConfirmed = status === 'confirmed';
  const compositionChanged =
    JSON.stringify(parseItems(composition)) !==
    JSON.stringify(
      (analysis.assessedItems ?? analysis.items).map((item) => item.trim()),
    );

  return (
    <section
      className="food-confirmation"
      aria-labelledby="food-confirmation-title"
    >
      <div className="food-confirmation-heading">
        <div>
          <p className="marathon-kicker">Результат разбора</p>
          <h2 id="food-confirmation-title">Что на фото</h2>
        </div>
        <span
          className={
            isConfirmed ? 'food-status food-status-confirmed' : 'food-status'
          }
        >
          {isConfirmed ? 'Добавлено в дневник' : 'Анализ не добавлен в дневник'}
        </span>
      </div>

      {editing && !isConfirmed ? (
        <label className="food-composition-editor">
          <span>Состав блюда</span>
          <textarea
            value={composition}
            onChange={(event) => setComposition(event.target.value)}
          />
        </label>
      ) : (
        <p className="food-composition">
          {parseItems(composition).join(', ') || 'Состав не указан'}
        </p>
      )}

      <div className="food-suitability" aria-live="polite">
        {compositionChanged ? (
          <p>
            Состав изменён. Прежняя оценка относится к исходному распознаванию.
            Исправленный состав пока не оценён.
          </p>
        ) : (
          <>
            {analysis.suitabilityStatus && (
              <p>
                <strong>{suitabilityLabels[analysis.suitabilityStatus]}</strong>
              </p>
            )}
            {analysis.suitability && <p>{analysis.suitability}</p>}
            {Boolean(analysis.missingData?.length) && (
              <div>
                <p>Для оценки не хватает данных:</p>
                <ul aria-label="Недостающие данные для оценки блюда">
                  {analysis.missingData!.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {!isConfirmed && (
        <div className="food-confirmation-actions">
          <button
            type="button"
            className="food-secondary-action"
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? 'Готово' : 'Исправить состав'}
          </button>
          {!confirming ? (
            <button
              type="button"
              className="food-primary-action"
              onClick={openConfirmation}
            >
              Съели это?
            </button>
          ) : (
            <div className="food-consumed-form">
              <p>Подтвердите, когда вы это съели.</p>
              <div className="food-date-time">
                <label>
                  <span>Дата</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label>
                  <span>Время</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="food-primary-action"
                onClick={confirm}
              >
                Подтвердить употребление
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="food-draft-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
