import type { AiMemory } from '../domain/ai-memory';
import type { CompanionProfileContext } from '../../profiles/application/get-companion-profile-context.use-case';
import type { CompanionWeightContext } from '../../tracking/application/get-companion-weight-context.use-case';

export interface MemoryContextDependencies {
  profile(userId: string): Promise<CompanionProfileContext>;
  weight(userId: string): Promise<CompanionWeightContext>;
  memories(userId: string): Promise<AiMemory[]>;
}

export class MemoryContextBuilder {
  constructor(private readonly dependencies: MemoryContextDependencies) {}

  async build(userId: string, query: string): Promise<string> {
    const [profile, weight, stored] = await Promise.all([
      this.dependencies.profile(userId),
      this.dependencies.weight(userId),
      this.dependencies.memories(userId),
    ]);
    const lines = [
      `Часовой пояс: ${profile.timezone}`,
      profile.displayName ? `Имя: ${profile.displayName}` : null,
      profile.personaId ? `Стиль общения: ${profile.personaId}` : null,
      profile.targetWeightKg
        ? `Целевой вес: ${profile.targetWeightKg} кг`
        : null,
      weight.startWeightKg
        ? `Стартовый вес: ${weight.startWeightKg} кг`
        : null,
      weight.currentWeightKg
        ? `Текущий вес: ${weight.currentWeightKg} кг`
        : null,
      weight.changeWeightKg
        ? `Изменение веса: ${weight.changeWeightKg} кг`
        : null,
      weight.lastRecordedAt
        ? `Последнее измерение: ${weight.lastRecordedAt}`
        : null,
    ].filter((line): line is string => Boolean(line));
    const queryWords = new Set(
      query.toLowerCase().match(/\p{L}+/gu)?.filter((word) => word.length > 2) ??
        [],
    );
    const facts = stored
      .filter((memory) => !containsSensitiveContent(memory.value))
      .sort((left, right) => {
        const relevance =
          scoreRelevance(right, queryWords) - scoreRelevance(left, queryWords);
        if (relevance) return relevance;
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, 12);
    if (facts.length) {
      lines.push('Устойчивые факты:');
      lines.push(...facts.map((fact) => `- ${fact.value}`));
    }
    return truncateCodePoints(lines.join('\n'), 1600);
  }
}

const sensitivePrefixes = [
  'диагноз',
  'диабет',
  'гипертон',
  'онколог',
  'анорекс',
  'булим',
  'депресс',
  'тревожн',
  'расстройств',
  'симптом',
  'боль',
  'болит',
  'обморок',
  'тошнот',
  'рвот',
  'головокруж',
  'давлен',
  'лекарств',
  'таблет',
  'препарат',
  'дозиров',
  'инсулин',
  'антидепресс',
  'терап',
  'аллерг',
  'непереносим',
  'беремен',
  'лактац',
  'грудн',
  'парол',
  'токен',
  'секрет',
  'паспорт',
];

export function containsSensitiveContent(value: string): boolean {
  const normalized = value.normalize('NFC').toLowerCase();
  if (normalized.includes('@')) return true;
  if (normalized.replace(/[+\s\-()]/g, '').match(/\d{7,}/)) return true;
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.some(
    (token) =>
      token === 'рак' ||
      token === 'карта' ||
      token === 'cvv' ||
      sensitivePrefixes.some((prefix) => token.startsWith(prefix)),
  );
}

function scoreRelevance(memory: AiMemory, queryWords: Set<string>): number {
  const terms = `${memory.key} ${memory.value}`.toLowerCase();
  return [...queryWords].some((word) => terms.includes(word)) ? 1 : 0;
}

function truncateCodePoints(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join('');
}
