export type AiProviderRequest = {
  operationId: string;
  promptVersion: 'quick-reply-v1';
  personaId: string;
  memoryContext?: string;
  nativePayload?: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; is_sync: false };
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
        'providerUnavailable' | 'invalidProviderResponse' | 'safetyRejected';
    }
  | { kind: 'outcomeUnknown'; providerReference?: string };

export type AiProviderLifecycle = { onAccepted(providerRequestId:string):Promise<void> };

export abstract class AiProviderAdapter {
  abstract readonly providerName: 'fake' | 'genapi';
  prepareRequest(request: AiProviderRequest): AiProviderRequest { return request; }
  abstract execute(request: AiProviderRequest,lifecycle?:AiProviderLifecycle): Promise<AiProviderResult>;
}
