import { FakeAiProviderAdapter } from '@atlas/backend';

describe('FakeAiProviderAdapter', () => {
  it('returns a deterministic success result without provider SDK access', async () => {
    const adapter = new FakeAiProviderAdapter('success');

    await expect(
      adapter.execute({
        operationId: 'op-1',
        promptVersion: 'quick-reply-v1',
        personaId: 'gentleFriend',
      }),
    ).resolves.toEqual({
      kind: 'success',
      text: 'Тестовый ответ AI. Сделайте один небольшой следующий шаг сегодня.',
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });
});
