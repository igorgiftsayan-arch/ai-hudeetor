import { DeterministicMemoryExtractor } from '@atlas/backend';

describe('DeterministicMemoryExtractor', () => {
  const extractor = new DeterministicMemoryExtractor();

  it.each([
    ['не люблю рыбу', 'preference', 'food.рыбу', 'не любит рыбу'],
    ['люблю рыбу', 'preference', 'food.рыбу', 'любит рыбу'],
    ['не ем мясо', 'restriction', 'food.мясо', 'не употребляет мясо'],
    [
      'вечером тянет на сладкое',
      'trigger',
      'craving.evening.сладкое',
      'вечером тянет на сладкое',
    ],
    [
      'не хочу жёсткого давления',
      'communicationPreference',
      'communication.pressure',
      'предпочитает общение без жёсткого давления',
    ],
  ])('extracts %s', (message, category, key, value) => {
    expect(extractor.extract(message)).toEqual([
      expect.objectContaining({ category, key, value }),
    ]);
  });

  it.each([
    'сегодня грустно',
    'рыба бывает норм',
    'хочу снизить давление',
    'мне помогают таблетки',
    'не ем рыбу из-за аллергии',
    'мой email user@example.com',
    'мой код 1234567',
  ])('rejects transient or sensitive input: %s', (message) => {
    expect(extractor.extract(message)).toEqual([]);
  });

  it('allows the non-medical word раков', () => {
    expect(extractor.extract('люблю раков')).toHaveLength(1);
  });
});
