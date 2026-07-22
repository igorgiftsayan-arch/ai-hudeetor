import type {
  OnboardingResourceDto,
  WeightEntryResourceDto,
} from '@atlas/api-contracts';
import { ApiError, apiRequest, mutationHeaders } from '../../shared/api';

export type WeightEntry = WeightEntryResourceDto;

type WeightEntryPage = {
  items: WeightEntry[];
  nextCursor: string | null;
};

export type TodayData = {
  csrfToken: string;
  entries: WeightEntry[];
  timezone: string;
};

export async function loadTodayData(): Promise<TodayData> {
  const onboarding = await apiRequest<OnboardingResourceDto>(
    '/users/me/onboarding',
  );
  if (onboarding.status !== 'completed') {
    throw new ApiError(
      'onboarding',
      'Завершите настройку, чтобы вести записи веса.',
    );
  }

  const page = await apiRequest<WeightEntryPage>('/weight-entries');
  return {
    csrfToken: onboarding.csrfToken,
    entries: page.items.slice(0, 10),
    timezone:
      onboarding.profile?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      'UTC',
  };
}

export async function createWeightEntry(input: {
  csrfToken: string;
  idempotencyKey: string;
  weightKg: number;
}): Promise<WeightEntry> {
  return apiRequest<WeightEntry>('/weight-entries', {
    method: 'POST',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify({ weightKg: input.weightKg }),
  });
}
