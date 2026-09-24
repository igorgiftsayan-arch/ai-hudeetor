import type {
  CreateFoodUploadIntentDtoContentType,
  FoodActionPriceDto,
  FoodAnalysisResourceDto,
  FoodConsumptionPageDto,
  FoodConsumptionResourceDto,
  FoodCorrectionDto,
  OnboardingResourceDto,
  QueuedFoodAnalysisResourceDto,
} from '@atlas/api-contracts';
import {
  ApiError,
  apiRequest,
  mutationHeaders,
  newIdempotencyKey,
} from '../../shared/api';

export type FoodScreenData = {
  csrfToken: string;
  timezone: string;
  price: FoodActionPriceDto;
  consumptions: FoodConsumptionResourceDto[];
};

export async function loadFoodScreen(): Promise<FoodScreenData> {
  const onboarding = await apiRequest<OnboardingResourceDto>(
    '/users/me/onboarding',
  );
  if (onboarding.status !== 'completed') {
    throw new ApiError(
      'onboarding',
      'Завершите настройку, чтобы вести дневник питания.',
    );
  }

  const [price, history] = await Promise.all([
    apiRequest<FoodActionPriceDto>('/ai-action-prices/food-photo-analysis'),
    apiRequest<FoodConsumptionPageDto>('/food-consumptions'),
  ]);

  return {
    csrfToken: onboarding.csrfToken,
    timezone:
      onboarding.profile?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      'UTC',
    price,
    consumptions: history.items,
  };
}

export async function prepareFoodImage({
  file,
  csrfToken,
}: {
  file: File;
  csrfToken: string;
}): Promise<string> {
  const checksum = await sha256(file);
  const upload = await apiRequest<{
    id: string;
    uploadUrl: string;
    requiredHeaders: Record<string, string>;
  }>('/food-images/upload-intents', {
    method: 'POST',
    headers: mutationHeaders(csrfToken, newIdempotencyKey()),
    body: JSON.stringify({
      contentType: file.type as CreateFoodUploadIntentDtoContentType,
      sizeBytes: file.size,
      sha256: checksum,
    }),
  });

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.requiredHeaders,
      body: file,
    });
  } catch {
    throw new ApiError(
      'network',
      'Не удалось загрузить фото. Проверьте интернет и попробуйте снова.',
    );
  }
  if (!uploadResponse.ok) {
    throw new ApiError(
      'request',
      'Не удалось загрузить фото. Попробуйте снова.',
    );
  }

  await apiRequest(`/food-images/${upload.id}/completions`, {
    method: 'POST',
    headers: mutationHeaders(csrfToken, newIdempotencyKey()),
  });

  return upload.id;
}

export function createFoodAnalysis({
  uploadedImageId,
  csrfToken,
  idempotencyKey,
  price,
}: {
  uploadedImageId: string;
  csrfToken: string;
  idempotencyKey: string;
  price: FoodActionPriceDto;
}): Promise<QueuedFoodAnalysisResourceDto> {
  return apiRequest<QueuedFoodAnalysisResourceDto>('/food-analyses', {
    method: 'POST',
    headers: mutationHeaders(csrfToken, idempotencyKey),
    body: JSON.stringify({
      uploadedImageId,
      expectedTokenPrice: price.tokenPrice,
      expectedPriceVersion: price.priceVersion,
    }),
  });
}

export function loadFoodAnalysis(analysisId: string) {
  return apiRequest<FoodAnalysisResourceDto>(`/food-analyses/${analysisId}`);
}

export function saveFoodCorrection({
  analysisId,
  csrfToken,
  correction,
}: {
  analysisId: string;
  csrfToken: string;
  correction: FoodCorrectionDto;
}) {
  return apiRequest<FoodAnalysisResourceDto>(
    `/food-analyses/${analysisId}/correction`,
    {
      method: 'PATCH',
      headers: mutationHeaders(csrfToken, newIdempotencyKey()),
      body: JSON.stringify(correction),
    },
  );
}

export function confirmFoodConsumption({
  analysisId,
  csrfToken,
  idempotencyKey,
  consumedAt,
  timezone,
}: {
  analysisId: string;
  csrfToken: string;
  idempotencyKey: string;
  consumedAt: string;
  timezone: string;
}) {
  return apiRequest<FoodConsumptionResourceDto>(
    `/food-analyses/${analysisId}/consumption-confirmations`,
    {
      method: 'POST',
      headers: mutationHeaders(csrfToken, idempotencyKey),
      body: JSON.stringify({ consumedAt, timezone }),
    },
  );
}

async function sha256(file: File) {
  if (!globalThis.crypto?.subtle) {
    throw new ApiError(
      'request',
      'На этом устройстве не удалось подготовить фото.',
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}
