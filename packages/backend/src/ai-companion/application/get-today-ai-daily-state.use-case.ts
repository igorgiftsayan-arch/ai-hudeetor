import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { AiCompanionError } from '../domain/ai-companion-error';
import type { AiDailyStateRepository } from './ai-daily-state-repository';
import type { DailyContextBuilder } from './daily-context-builder';

export class GetTodayAiDailyStateUseCase {
  constructor(
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiDailyStateRepository,
    private readonly context: DailyContextBuilder,
  ) {}

  async execute(accessToken: string) {
    const identity = await this.currentUser.execute(accessToken);
    if (identity.onboardingStatus !== 'completed')
      throw new AiCompanionError(
        'ONBOARDING_INCOMPLETE',
        409,
        'Complete onboarding before using the daily coach',
      );
    const state = await this.repository.getOrCreateToday(identity.userId);
    const resource = {
      id: state.id,
      localDate: state.localDate,
      status: state.status,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
    return {
      ...resource,
      context: await this.context.build(identity.userId, state.localDate),
    };
  }
}
