import { IdentityError } from '../../identity/domain/identity-error';

export function calendarDateInTimezone(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    throw new IdentityError(
      'MARATHON_TIMEZONE_INVALID',
      422,
      'The marathon timezone is invalid',
    );
  }
}

export function previousCalendarDate(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
