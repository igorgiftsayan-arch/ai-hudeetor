import { calendarDateInTimezone, previousCalendarDate } from '@atlas/backend';
describe('marathon calendar date', () => {
  it('uses one explicit marathon timezone around UTC midnight', () => {
    const now = new Date('2026-09-24T16:30:00.000Z');
    expect(calendarDateInTimezone(now, 'Asia/Irkutsk')).toBe('2026-09-25');
    expect(calendarDateInTimezone(now, 'Europe/Moscow')).toBe('2026-09-24');
  });
  it('calculates the preceding calendar date across a month boundary', () =>
    expect(previousCalendarDate('2026-10-01')).toBe('2026-09-30'));
});
