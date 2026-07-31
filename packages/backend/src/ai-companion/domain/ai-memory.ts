export const aiMemoryCategories = [
  'restriction',
  'trigger',
  'communicationPreference',
  'supportStrategy',
  'goal',
  'preference',
] as const;

export type AiMemoryCategory = (typeof aiMemoryCategories)[number];
export type AiMemorySource = 'conversation' | 'profile' | 'system';

export interface AiMemory {
  id: string;
  userId: string;
  category: AiMemoryCategory;
  key: string;
  value: string;
  source: AiMemorySource;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}
