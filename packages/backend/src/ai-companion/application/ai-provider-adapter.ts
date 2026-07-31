export type AiProviderRequest = {
  operationId: string;
  promptVersion: 'quick-reply-v1';
  personaId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type AiProviderResult =
  | {
      kind: 'success';
      text: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cost?: number;
      };
      providerReference?: string;
    }
  | {
      kind: 'technicalError';
      errorClass:
        | 'providerUnavailable'
        | 'invalidProviderResponse'
        | 'safetyRejected';
    }
  | { kind: 'outcomeUnknown' };

export abstract class AiProviderAdapter {
  abstract readonly providerName: 'fake' | 'genapi';
  abstract execute(request: AiProviderRequest): Promise<AiProviderResult>;
}
