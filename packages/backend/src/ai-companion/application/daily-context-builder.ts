import type { AiMemory, AiMemoryCategory } from '../domain/ai-memory';
import type { CompanionProfileContext } from '../../profiles/application/get-companion-profile-context.use-case';
import type { CompanionWeightContext } from '../../tracking/application/get-companion-weight-context.use-case';
import { containsSensitiveContent } from './memory-context-builder';

export interface DailyContextDependencies {
  profile(userId: string): Promise<CompanionProfileContext>;
  weight(userId: string): Promise<CompanionWeightContext>;
  memories(userId: string): Promise<AiMemory[]>;
}

export interface DailyContext {
  localDate: string;
  timezone: string;
  profile: {
    displayName?: string;
    targetWeightKg?: string;
    personaId?: string;
  };
  weight: {
    startWeightKg?: string;
    currentWeightKg?: string;
    changeWeightKg?: string;
    lastRecordedAt?: string;
  };
  memories: Array<{
    category: AiMemoryCategory;
    key: string;
    value: string;
  }>;
}

export class DailyContextBuilder {
  constructor(private readonly dependencies: DailyContextDependencies) {}

  async build(userId: string, localDate: string): Promise<DailyContext> {
    const [profile, weight, memories] = await Promise.all([
      this.dependencies.profile(userId),
      this.dependencies.weight(userId),
      this.dependencies.memories(userId),
    ]);
    return {
      localDate,
      timezone: profile.timezone,
      profile: compact({
        displayName: profile.displayName ?? undefined,
        targetWeightKg: profile.targetWeightKg ?? undefined,
        personaId: profile.personaId ?? undefined,
      }),
      weight: compact({
        startWeightKg: weight.startWeightKg ?? undefined,
        currentWeightKg: weight.currentWeightKg ?? undefined,
        changeWeightKg: weight.changeWeightKg ?? undefined,
        lastRecordedAt: weight.lastRecordedAt ?? undefined,
      }),
      memories: memories
        .filter((memory) => !containsSensitiveContent(memory.value))
        .slice(0, 12)
        .map(({ category, key, value }) => ({ category, key, value })),
    };
  }
}

function compact<T extends Record<string, string | undefined>>(
  value: T,
): { [Key in keyof T]?: string } {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  ) as { [Key in keyof T]?: string };
}
