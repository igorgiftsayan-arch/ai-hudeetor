export type ApiErrorKind = 'network' | 'session' | 'onboarding' | 'request';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const apiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export async function apiRequest<TResult>(
  path: string,
  init?: RequestInit,
): Promise<TResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      credentials: 'include',
      ...init,
    });
  } catch {
    throw new ApiError(
      'network',
      'Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.',
    );
  }

  const body = (await response.json().catch(() => undefined)) as
    TResult | { error?: { code?: string; message?: string } } | undefined;

  if (response.ok) return body as TResult;

  const error = (body as { error?: { code?: string; message?: string } })
    ?.error;
  if (response.status === 401) {
    throw new ApiError('session', 'Сессия закончилась', error?.code);
  }

  throw new ApiError(
    'request',
    error?.message ?? 'Не удалось выполнить запрос. Попробуйте снова.',
    error?.code,
  );
}

export function mutationHeaders(
  csrfToken: string,
  idempotencyKey: string,
): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
    'Idempotency-Key': idempotencyKey,
  };
}

export function newIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
