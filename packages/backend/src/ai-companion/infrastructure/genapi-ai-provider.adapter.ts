import {
  AiProviderAdapter,
  type AiProviderRequest,
  type AiProviderResult,
} from '../application/ai-provider-adapter';

export type AiTechnicalLogRecord = {
  provider: 'genapi';
  model: string;
  requestId: string;
  responseId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  latencyMs: number;
  status: 'succeeded' | 'technicalError' | 'outcomeUnknown';
  errorCode: string | null;
};

type GenApiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

const connectionFailureCodes = new Set([
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
]);

const personaInstructions: Record<string, string> = {
  gentleFriend: 'Общайся тепло, бережно и без осуждения.',
  strictCoach: 'Общайся прямо и структурно, но без стыда и унижения.',
  russianKick:
    'Используй доброжелательную разговорную встряску без оскорблений.',
  glamorousFriend: 'Общайся ярко, уверенно и дружелюбно без оценки внешности.',
  analyst: 'Общайся спокойно, нейтрально и причинно-следственно.',
};

export class GenApiAiProviderAdapter extends AiProviderAdapter {
  readonly providerName = 'genapi' as const;

  constructor(
    private readonly config: GenApiConfig,
    private readonly fetcher: Fetcher = fetch,
    private readonly log: (record: AiTechnicalLogRecord) => void = (record) =>
      console.info(JSON.stringify({ event: 'ai_provider_request', ...record })),
  ) {
    super();
  }

  async execute(request: AiProviderRequest): Promise<AiProviderResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchWithConnectionRetry(
        request,
        controller.signal,
      );
    } catch (error) {
      clearTimeout(timer);
      const outcomeUnknown =
        isAbort(error) || !isConfirmedConnectionFailure(error);
      this.writeLog(request, startedAt, {
        status: outcomeUnknown ? 'outcomeUnknown' : 'technicalError',
        errorCode: outcomeUnknown ? 'timeout' : 'providerUnavailable',
      });
      return outcomeUnknown
        ? { kind: 'outcomeUnknown' }
        : { kind: 'technicalError', errorClass: 'providerUnavailable' };
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorCode = mapHttpError(response.status);
      this.writeLog(request, startedAt, {
        status: 'technicalError',
        errorCode,
      });
      return { kind: 'technicalError', errorClass: 'providerUnavailable' };
    }

    const body = await safeJson(response);
    const text = extractText(body);
    if (!text) {
      this.writeLog(request, startedAt, {
        status: 'technicalError',
        errorCode: 'invalidProviderResponse',
      });
      return {
        kind: 'technicalError',
        errorClass: 'invalidProviderResponse',
      };
    }
    const usage = extractUsage(body);
    const responseId =
      isRecord(body) && typeof body.id === 'string' ? body.id : undefined;
    this.writeLog(request, startedAt, {
      status: 'succeeded',
      errorCode: null,
      responseId,
      ...usage,
    });
    return {
      kind: 'success',
      text,
      usage,
      ...(responseId ? { providerReference: responseId } : {}),
    };
  }

  private async fetchWithConnectionRetry(
    request: AiProviderRequest,
    signal: AbortSignal,
  ): Promise<Response> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Request-ID': request.operationId,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(request.personaId),
          },
          ...request.messages,
        ],
      }),
      signal,
    };
    try {
      return await this.fetcher(url, init);
    } catch (error) {
      if (!isConfirmedConnectionFailure(error) || signal.aborted) throw error;
      return this.fetcher(url, init);
    }
  }

  private writeLog(
    request: AiProviderRequest,
    startedAt: number,
    data: Partial<AiTechnicalLogRecord> &
      Pick<AiTechnicalLogRecord, 'status' | 'errorCode'>,
  ): void {
    this.log({
      provider: 'genapi',
      model: this.config.model,
      requestId: request.operationId,
      responseId: data.responseId ?? null,
      inputTokens: data.inputTokens ?? null,
      outputTokens: data.outputTokens ?? null,
      totalTokens: data.totalTokens ?? null,
      cost: data.cost ?? null,
      latencyMs: Math.max(0, Date.now() - startedAt),
      status: data.status,
      errorCode: data.errorCode,
    });
  }
}

function buildSystemPrompt(personaId: string): string {
  return [
    'Ты — AI-друг в wellness-продукте для снижения веса.',
    personaInstructions[personaId] ?? personaInstructions.gentleFriend,
    'Не ставь диагнозы, не стыди за вес или еду, не рекомендуй голодание или наказание едой.',
    'Не обещай гарантированный результат. Предлагай один безопасный небольшой следующий шаг.',
  ].join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractText(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.choices)) return null;
  const first = body.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  const content = first.message.content;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
}

function extractUsage(body: unknown): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
} {
  const usage = isRecord(body) && isRecord(body.usage) ? body.usage : {};
  const inputTokens = numberOrZero(usage.prompt_tokens);
  const outputTokens = numberOrZero(usage.completion_tokens);
  const totalTokens =
    numberOrZero(usage.total_tokens) || inputTokens + outputTokens;
  const cost = typeof usage.cost === 'number' ? usage.cost : undefined;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cost !== undefined ? { cost } : {}),
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isConfirmedConnectionFailure(error: unknown): boolean {
  if (!isRecord(error) || !isRecord(error.cause)) return false;
  return (
    typeof error.cause.code === 'string' &&
    connectionFailureCodes.has(error.cause.code)
  );
}

function mapHttpError(status: number): string {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'modelNotFound';
  if (status === 429) return 'rateLimited';
  return `http${status}`;
}
