import { describe, expect, it } from 'vitest';
import { formatWeight, validateWeight } from './weight-format';

describe('weight precision', () => {
  it.each([
    ['98', 98, '98.00'],
    ['98.4', 98.4, '98.40'],
    ['98,45', 98.45, '98.45'],
  ])('accepts %s with up to two fractional digits', (input, value, payload) => {
    expect(validateWeight(input)).toEqual({ ok: true, value, payload });
  });

  it('rejects more than two fractional digits', () => {
    expect(validateWeight('98.456')).toEqual({
      ok: false,
      message: 'Используйте не больше двух знаков после запятой.',
    });
  });

  it('renders stored two-decimal weights without losing precision', () => {
    expect(formatWeight('98.45')).toBe('98,45 кг');
  });
});
