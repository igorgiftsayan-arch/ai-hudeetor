import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFoodAnalysis,
  loadFoodScreen,
  prepareFoodImage,
} from './food-api';

const api = '/api/v1';

afterEach(() => vi.unstubAllGlobals());

describe('food API boundary', () => {
  it('loads the managed price and only confirmed consumption history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`)
          return json({
            status: 'completed',
            csrfToken: 'csrf-token',
            profile: { timezone: 'Asia/Irkutsk' },
          });
        if (url === `${api}/ai-action-prices/food-photo-analysis`)
          return json({
            actionType: 'foodPhotoAnalysis',
            tokenPrice: 3,
            priceVersion: 2,
          });
        if (url === `${api}/food-consumptions`)
          return json({
            items: [
              {
                id: 'consumption-1',
                foodAnalysisId: 'analysis-1',
                consumedAt: '2026-09-24T02:30:00.000Z',
                localDate: '2026-09-24',
                timezone: 'Asia/Irkutsk',
                confirmedResult: { items: [{ name: 'гречка' }] },
              },
            ],
          });
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await expect(loadFoodScreen()).resolves.toEqual({
      csrfToken: 'csrf-token',
      timezone: 'Asia/Irkutsk',
      price: {
        actionType: 'foodPhotoAnalysis',
        tokenPrice: 3,
        priceVersion: 2,
      },
      consumptions: [
        expect.objectContaining({
          id: 'consumption-1',
          localDate: '2026-09-24',
        }),
      ],
    });
  });

  it('uses the typed upload, completion and queued-analysis contract in order', async () => {
    const file = new File(['image bytes'], 'lunch.jpg', { type: 'image/jpeg' });
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async () => new Uint8Array(32).buffer),
      },
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/food-images/upload-intents`) {
          expect(init?.method).toBe('POST');
          expect(init?.body).toBe(
            JSON.stringify({
              contentType: 'image/jpeg',
              sizeBytes: file.size,
              sha256: '0'.repeat(64),
            }),
          );
          return json(
            {
              id: 'image-1',
              status: 'pendingUpload',
              uploadUrl: 'https://private-upload.example/image-1',
              expiresAt: '2026-09-24T10:00:00.000Z',
              requiredHeaders: { 'content-type': 'image/jpeg' },
            },
            201,
          );
        }
        if (url === 'https://private-upload.example/image-1') {
          expect(init?.method).toBe('PUT');
          expect(init?.body).toBe(file);
          return new Response(null, { status: 200 });
        }
        if (url === `${api}/food-images/image-1/completions`) {
          expect(init?.method).toBe('POST');
          return json({ id: 'image-1', status: 'available' });
        }
        if (url === `${api}/food-analyses`) {
          expect(init?.method).toBe('POST');
          expect(init?.body).toBe(
            JSON.stringify({
              uploadedImageId: 'image-1',
              expectedTokenPrice: 3,
              expectedPriceVersion: 2,
            }),
          );
          expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(
            'analysis-key',
          );
          return json(
            {
              id: 'analysis-1',
              status: 'queued',
              reservedTokens: 3,
              priceVersion: 2,
              pollingUrl: '/api/v1/food-analyses/analysis-1',
            },
            202,
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      prepareFoodImage({ file, csrfToken: 'csrf-token' }),
    ).resolves.toEqual('image-1');
    await expect(
      createFoodAnalysis({
        uploadedImageId: 'image-1',
        csrfToken: 'csrf-token',
        idempotencyKey: 'analysis-key',
        price: {
          actionType: 'foodPhotoAnalysis',
          tokenPrice: 3,
          priceVersion: 2,
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'analysis-1', status: 'queued' }),
    );
  });

  it('retries analysis creation with the same image and idempotency key', async () => {
    const keys: string[] = [];
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        attempts += 1;
        keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return json(
          {
            id: 'analysis-1',
            status: 'queued',
            reservedTokens: 3,
            priceVersion: 2,
            pollingUrl: '/api/v1/food-analyses/analysis-1',
          },
          202,
        );
      }),
    );
    const input = {
      uploadedImageId: 'image-1',
      csrfToken: 'csrf-token',
      idempotencyKey: 'stable-analysis-key',
      price: {
        actionType: 'foodPhotoAnalysis' as const,
        tokenPrice: 3,
        priceVersion: 2,
      },
    };

    await expect(createFoodAnalysis(input)).rejects.toMatchObject({
      kind: 'network',
    });
    await expect(createFoodAnalysis(input)).resolves.toMatchObject({
      id: 'analysis-1',
    });

    expect(keys).toEqual(['stable-analysis-key', 'stable-analysis-key']);
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
