import {
  AiProviderAdapter,
  type AiProviderRequest,
  type AiProviderResult,
} from '../application/ai-provider-adapter';

export type FakeAiMode = 'success' | 'technicalError' | 'outcomeUnknown';

export class FakeAiProviderAdapter extends AiProviderAdapter {
  readonly providerName = 'fake' as const;
  constructor(private readonly mode: FakeAiMode) {
    super();
  }

  async execute(_request: AiProviderRequest): Promise<AiProviderResult> {
    void _request;
    if (this.mode === 'technicalError')
      return { kind: 'technicalError', errorClass: 'providerUnavailable' };
    if (this.mode === 'outcomeUnknown') return { kind: 'outcomeUnknown' };
    return {
      kind: 'success',
      text: 'Тестовый ответ AI. Сделайте один небольшой следующий шаг сегодня.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
}
