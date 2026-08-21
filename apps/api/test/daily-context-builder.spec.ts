import { DailyContextBuilder } from '@atlas/backend';

describe('DailyContextBuilder', () => {
  it('returns only real structured system data and active safe memories', async () => {
    const builder = new DailyContextBuilder({
      profile: jest.fn().mockResolvedValue({
        timezone: 'Asia/Irkutsk',
        displayName: null,
        targetWeightKg: '75.00',
        personaId: 'analyst',
      }),
      weight: jest.fn().mockResolvedValue({
        startWeightKg: '82.00',
        currentWeightKg: '79.50',
        changeWeightKg: '-2.50',
        lastRecordedAt: '2026-08-20T23:30:00.000Z',
      }),
      memories: jest
        .fn()
        .mockResolvedValue([
          memory('safe', 'вечером тянет на сладкое'),
          memory('sensitive', 'принимаю лекарства'),
        ]),
    });

    await expect(builder.build('user-1', '2026-08-21')).resolves.toEqual({
      localDate: '2026-08-21',
      timezone: 'Asia/Irkutsk',
      profile: {
        targetWeightKg: '75.00',
        personaId: 'analyst',
      },
      weight: {
        startWeightKg: '82.00',
        currentWeightKg: '79.50',
        changeWeightKg: '-2.50',
        lastRecordedAt: '2026-08-20T23:30:00.000Z',
      },
      memories: [
        {
          category: 'trigger',
          key: 'safe',
          value: 'вечером тянет на сладкое',
        },
      ],
    });
  });

  it('limits memory context to twelve facts', async () => {
    const builder = new DailyContextBuilder({
      profile: jest.fn().mockResolvedValue({
        timezone: 'UTC',
        displayName: null,
        targetWeightKg: null,
        personaId: null,
      }),
      weight: jest.fn().mockResolvedValue({
        startWeightKg: null,
        currentWeightKg: null,
        changeWeightKg: null,
        lastRecordedAt: null,
      }),
      memories: jest
        .fn()
        .mockResolvedValue(
          Array.from({ length: 15 }, (_, index) =>
            memory(`fact-${index}`, `факт ${index}`),
          ),
        ),
    });

    const result = await builder.build('user-1', '2026-08-21');

    expect(result.memories).toHaveLength(12);
    expect(JSON.stringify(result)).not.toContain('undefined');
  });
});

function memory(key: string, value: string) {
  return {
    id: key,
    userId: 'user-1',
    category: 'trigger' as const,
    key,
    value,
    source: 'conversation' as const,
    confidence: 0.9,
    sourceMessageId: null,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
}
