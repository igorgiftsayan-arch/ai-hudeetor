import type { AiMemoryCategory } from '../domain/ai-memory';
import { containsSensitiveContent } from './memory-context-builder';

export interface ExtractedMemoryFact {
  category: AiMemoryCategory;
  key: string;
  value: string;
  confidence: number;
}

type Rule = {
  pattern: RegExp;
  category: AiMemoryCategory;
  key: (value: string) => string;
  value: (value: string) => string;
  confidence: number;
};

const rules: Rule[] = [
  rule(/^(?:я )?не люблю (.+)$/u, 'preference', 'food', (v) => `не любит ${v}`, 0.9),
  rule(/^(?:я )?люблю (.+)$/u, 'preference', 'food', (v) => `любит ${v}`, 0.9),
  rule(/^(?:я )?(?:не ем|не употребляю) (.+)$/u, 'restriction', 'food', (v) => `не употребляет ${v}`, 0.95),
  rule(/^вечером тянет на (.+)$/u, 'trigger', 'craving.evening', (v) => `вечером тянет на ${v}`, 0.9),
  rule(/^по выходным сложно (.+)$/u, 'trigger', 'routine.weekend', (v) => `по выходным сложно ${v}`, 0.85),
  rule(/^(?:мне )?помогают (.+)$/u, 'supportStrategy', 'support', (v) => `помогает ${v}`, 0.9),
  rule(/^(?:моя цель\s*[—-]\s*|хочу )(.+)$/u, 'goal', 'goal', (v) => v, 0.8),
];

export class DeterministicMemoryExtractor {
  extract(message: string): ExtractedMemoryFact[] {
    return message
      .normalize('NFC')
      .split(/[.!?\n]+/u)
      .map((part) => part.trim().toLowerCase().replace(/\s+/gu, ' '))
      .filter(Boolean)
      .flatMap((sentence) => this.extractSentence(sentence));
  }

  private extractSentence(sentence: string): ExtractedMemoryFact[] {
    if (containsSensitiveContent(sentence)) return [];
    if (sentence === 'не хочу жёсткого давления')
      return [{
        category: 'communicationPreference',
        key: 'communication.pressure',
        value: 'предпочитает общение без жёсткого давления',
        confidence: 0.95,
      }];
    if (
      sentence === 'говори короче' ||
      sentence === 'предпочитаю короткие ответы'
    )
      return [{
        category: 'communicationPreference',
        key: 'communication.length',
        value: 'предпочитает короткие ответы',
        confidence: 0.95,
      }];
    for (const candidate of rules) {
      const match = sentence.match(candidate.pattern);
      const placeholder = match?.[1]?.trim();
      if (!placeholder) continue;
      const points = Array.from(placeholder);
      if (
        points.length < 2 ||
        points.length > 60 ||
        /[@\p{Cc}]/u.test(placeholder)
      )
        return [];
      return [{
        category: candidate.category,
        key: `${candidate.key(placeholder)}.${normalizeKey(placeholder)}`,
        value: candidate.value(placeholder),
        confidence: candidate.confidence,
      }];
    }
    return [];
  }
}

function rule(
  pattern: RegExp,
  category: AiMemoryCategory,
  keyPrefix: string,
  value: (value: string) => string,
  confidence: number,
): Rule {
  return {
    pattern,
    category,
    key: () => keyPrefix,
    value,
    confidence,
  };
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}
