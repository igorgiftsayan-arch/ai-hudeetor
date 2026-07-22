import type { WeightEntry } from './tracking-api';

export type WeightValidation =
  { ok: true; value: number; payload: string } | { ok: false; message: string };

export function validateWeight(input: string): WeightValidation {
  const normalized = input.trim().replace(',', '.');
  if (!normalized) return { ok: false, message: 'Введите сегодняшний вес.' };
  if (!/^\d+(?:\.\d)?$/.test(normalized)) {
    return {
      ok: false,
      message: 'Используйте не больше одного знака после запятой.',
    };
  }

  const value = Number(normalized);
  if (value < 20 || value > 500) {
    return { ok: false, message: 'Введите вес от 20 до 500 кг.' };
  }

  return { ok: true, value, payload: value.toFixed(1) };
}

export function formatWeight(weightKg: string | number): string {
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(weightKg))} кг`;
}

export function formatDelta(
  current: WeightEntry,
  previous: WeightEntry,
  withContext = false,
): string {
  const delta =
    Math.round((Number(current.weightKg) - Number(previous.weightKg)) * 10) /
    10;
  const sign = delta < 0 ? '−' : delta > 0 ? '+' : '';
  const amount = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(delta));
  return `${sign}${amount} кг${withContext ? ' с прошлой записи' : ''}`;
}

export function formatToday(date: Date, timezone: string): string {
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(date);
  return `Сегодня, ${formatted}`;
}

export function formatEntryDate(recordedAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(new Date(recordedAt));
}

export function newestFirst(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort(
    (left, right) =>
      new Date(right.recordedAt).getTime() -
      new Date(left.recordedAt).getTime(),
  );
}
