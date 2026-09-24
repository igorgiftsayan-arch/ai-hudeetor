import { createHash } from 'node:crypto';
import type { AiProviderRequest } from '../application/ai-provider-adapter';
import type { ReconciledAiSuccess } from '../application/finalize-reconciled-ai-outcome.use-case';
import { buildGenApiChatPayload } from './genapi-ai-provider.adapter';

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export class GenApiOutcomeReconciliationClient {
  constructor(
    private readonly config: {
      apiKey: string;
      requestApiBaseUrl: string;
      model: string;
      timeoutMs?: number;
    },
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async verifySuccess(input: {
    operationId: string;
    providerRequestId: string;
    request: AiProviderRequest;
    operationCreatedAt: Date;
    outcomeUnknownAt: Date;
  }): Promise<ReconciledAiSuccess> {
    const response = await this.fetcher(
      `${this.config.requestApiBaseUrl.replace(/\/$/, '')}/request/get/${encodeURIComponent(input.providerRequestId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      },
    );
    if (!response.ok) throw new Error('GenAPI reconciliation lookup failed');
    const body: unknown = await response.json();
    if (!isRecord(body) || body.status !== 'success')
      throw new Error('GenAPI request is not successfully completed');
    if (String(body.id) !== input.providerRequestId)
      throw new Error('GenAPI request id mismatch');
    const expected = input.request.nativePayload ?? buildGenApiChatPayload(input.request, this.config.model);
    if (!isRecord(body.parameters) || body.network !== this.config.model)
      throw new Error('GenAPI request model mismatch');
    const expectedMessages = expected.messages;
    const actualMessages = body.parameters.messages;
    if (
      !Array.isArray(actualMessages) ||
      stableHash(actualMessages) !== stableHash(expectedMessages)
    )
      throw new Error('GenAPI request parameters mismatch');

    const result = Array.isArray(body.result) ? body.result[0] : null;
    const observedGrokAlias = isRecord(result) && this.config.model === 'grok-4-5'
      && body.parameters.model === 'grok-4.5' && result.model === 'x-ai/grok-4.5';
    if (!isRecord(result) || (result.model !== this.config.model && !observedGrokAlias))
      throw new Error('GenAPI result model mismatch');
    const resultCreatedMs =
      typeof result.created === 'number' ? result.created * 1000 : NaN;
    if (
      !Number.isFinite(resultCreatedMs) ||
      resultCreatedMs < input.operationCreatedAt.getTime() - 5_000 ||
      resultCreatedMs > input.outcomeUnknownAt.getTime() + 5_000
    )
      throw new Error('GenAPI result timestamp mismatch');
    const choices = Array.isArray(result.choices) ? result.choices : [];
    const choice = isRecord(choices[0]) ? choices[0] : null;
    const message = choice && isRecord(choice.message) ? choice.message : null;
    const text = message?.content;
    if (typeof text !== 'string' || !text.trim())
      throw new Error('GenAPI reconciliation result is empty');
    const usage = isRecord(result.usage) ? result.usage : {};
    const inputTokens = safeInteger(usage.prompt_tokens);
    const outputTokens = safeInteger(usage.completion_tokens);
    const totalTokens = safeInteger(usage.total_tokens);
    const cost =
      typeof body.cost === 'number' && body.cost >= 0 ? body.cost : null;
    const runtimeSeconds = typeof body.runtime === 'number' ? body.runtime : 0;
    return {
      operationId: input.operationId,
      providerRequestId: input.providerRequestId,
      providerResponseId: String(result.id ?? ''),
      providerModel: this.config.model,
      text: text.trim(),
      inputTokens,
      outputTokens,
      totalTokens,
      cost,
      latencyMs: Math.max(0, Math.round(runtimeSeconds * 1000)),
      parametersHash: stableHash(body.parameters),
    };
  }
}

function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}
