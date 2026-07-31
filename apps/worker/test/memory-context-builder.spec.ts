import { MemoryContextBuilder, type AiMemory } from '@atlas/backend';

describe('MemoryContextBuilder', () => {
  it('includes only actual system values and active safe facts', async () => {
    const builder = new MemoryContextBuilder({
      profile: async () => ({
        timezone: 'Asia/Irkutsk',
        displayName: null,
        targetWeightKg: '85.00',
        personaId: 'gentleFriend',
      }),
      weight: async () => ({
        startWeightKg: '98.45',
        currentWeightKg: '96.20',
        changeWeightKg: '-2.25',
        lastRecordedAt: '2026-07-31T01:00:00.000Z',
      }),
      memories: async () => [
        memory('restriction', 'не употребляет рыбу'),
        memory('preference', 'принимает таблетки'),
      ],
    });

    const context = await builder.build('user', 'Что по питанию?');

    expect(context).toContain('Целевой вес: 85.00 кг');
    expect(context).toContain('Стартовый вес: 98.45 кг');
    expect(context).toContain('не употребляет рыбу');
    expect(context).not.toContain('Имя:');
    expect(context).not.toContain('таблетки');
  });

  it('caps facts at 12 and output at 1600 Unicode code points', async () => {
    const builder = new MemoryContextBuilder({
      profile: async () => ({
        timezone: 'UTC',
        displayName: '😀'.repeat(1000),
        targetWeightKg: null,
        personaId: null,
      }),
      weight: async () => ({
        startWeightKg: null,
        currentWeightKg: null,
        changeWeightKg: null,
        lastRecordedAt: null,
      }),
      memories: async () =>
        Array.from({ length: 20 }, (_, index) =>
          memory('preference', `факт ${index}`),
        ),
    });
    const context = await builder.build('user', '');
    expect(Array.from(context).length).toBeLessThanOrEqual(1600);
    expect(context).not.toContain('\uFFFD');
    expect((context.match(/^- факт/gmu) ?? []).length).toBeLessThanOrEqual(12);
  });
});

function memory(
  category: AiMemory['category'],
  value: string,
): AiMemory {
  return {
    id: crypto.randomUUID(),
    userId: 'user',
    category,
    key: value.replaceAll(' ', '.'),
    value,
    source: 'conversation',
    confidence: 0.9,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}
