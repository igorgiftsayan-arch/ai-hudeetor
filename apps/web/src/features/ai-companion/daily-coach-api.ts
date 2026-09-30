import type {
  AiDailyStateResourceDto,
  AiDailyStateTransitionResourceDto,
  TransitionAiDailyStateRequestDto,
} from '@atlas/api-contracts';
import { apiRequest, mutationHeaders } from '../../shared/api';

export type AiDailyState = AiDailyStateResourceDto;
export type AiDailyStateTransition = AiDailyStateTransitionResourceDto;

export function loadDailyState(): Promise<AiDailyState> {
  return apiRequest<AiDailyState>('/ai-daily-states/today');
}

export function transitionDailyState(input: {
  stateId: string;
  csrfToken: string;
  idempotencyKey: string;
  targetStatus: TransitionAiDailyStateRequestDto['targetStatus'];
}): Promise<AiDailyStateTransition> {
  return apiRequest<AiDailyStateTransition>(
    `/ai-daily-states/${input.stateId}/transitions`,
    {
      method: 'POST',
      headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
      body: JSON.stringify({ targetStatus: input.targetStatus }),
    },
  );
}
