export type AiProviderRequest = {
  operationId: string;
  promptVersion: 'quick-reply-v1';
  personaId: string;
};

export type AiProviderResult =
  | {
      kind: 'success';
      text: string;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { kind: 'technicalError'; errorClass: 'providerUnavailable' }
  | { kind: 'outcomeUnknown' };

export abstract class AiProviderAdapter {
  abstract execute(request: AiProviderRequest): Promise<AiProviderResult>;
}
