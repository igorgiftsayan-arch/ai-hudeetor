import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { AiCompanionError } from '../domain/ai-companion-error';
import type { AiDailyStateRepository } from './ai-daily-state-repository';

export class TransitionAiDailyStateUseCase {
  constructor(
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiDailyStateRepository,
  ) {}

  async execute(input: {
    accessToken: string;
    stateId: string;
    targetStatus: 'inProgress' | 'completed';
    idempotencyKey: string;
  }) {
    const identity = await this.currentUser.execute(input.accessToken);
    if (identity.onboardingStatus !== 'completed')
      throw new AiCompanionError(
        'ONBOARDING_INCOMPLETE',
        409,
        'Complete onboarding before using the daily coach',
      );
    const state = await this.repository.transition({
      userId: identity.userId,
      stateId: input.stateId,
      targetStatus: input.targetStatus,
      idempotencyKey: input.idempotencyKey,
    });
    const resource = {
      id: state.id,
      localDate: state.localDate,
      status: state.status,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
    return resource;
  }
}
