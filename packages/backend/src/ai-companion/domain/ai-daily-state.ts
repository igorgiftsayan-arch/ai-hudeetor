import { AiCompanionError } from './ai-companion-error';

export type AiDailyStateStatus = 'notStarted' | 'inProgress' | 'completed';

export interface AiDailyState {
  id: string;
  userId: string;
  localDate: string;
  status: AiDailyStateStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function applyAiDailyStateTransition(
  current: AiDailyStateStatus,
  target: AiDailyStateStatus,
): { status: AiDailyStateStatus; changed: boolean } {
  if (current === target) return { status: current, changed: false };
  if (
    (current === 'notStarted' && target === 'inProgress') ||
    (current === 'inProgress' && target === 'completed')
  )
    return { status: target, changed: true };
  throw new AiCompanionError(
    'DAILY_STATE_TRANSITION_INVALID',
    409,
    'The requested daily state transition is not allowed',
    { currentStatus: current, targetStatus: target },
  );
}
