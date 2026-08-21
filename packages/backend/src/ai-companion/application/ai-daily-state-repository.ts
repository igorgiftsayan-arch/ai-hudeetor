import type {
  AiDailyState,
  AiDailyStateStatus,
} from '../domain/ai-daily-state';

export abstract class AiDailyStateRepository {
  abstract getOrCreateToday(userId: string): Promise<AiDailyState>;
  abstract transition(input: {
    userId: string;
    stateId: string;
    targetStatus: Exclude<AiDailyStateStatus, 'notStarted'>;
    idempotencyKey: string;
  }): Promise<AiDailyState>;
}
