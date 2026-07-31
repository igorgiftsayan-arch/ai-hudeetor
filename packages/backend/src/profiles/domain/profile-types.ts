import type { OnboardingStatus } from '../../identity/domain/identity-types';

export const personaIds = [
  'gentleFriend',
  'strictCoach',
  'russianLuli',
  'glamorousFriend',
  'analyst',
] as const;
export type PersonaId = (typeof personaIds)[number];
export const strictnessValues = ['low', 'medium', 'high'] as const;
export type Strictness = (typeof strictnessValues)[number];
export const responseLengthValues = ['short', 'medium', 'long'] as const;
export type ResponseLength = (typeof responseLengthValues)[number];

export interface UserProfile {
  userId: string;
  timezone: string;
  displayName: string | null;
  targetWeightKg: string | null;
}

export interface AiPreference {
  userId: string;
  personaId: PersonaId;
  strictness: Strictness;
  responseLength: ResponseLength;
}

export interface OnboardingState {
  status: OnboardingStatus;
  profile: UserProfile | null;
  preference: AiPreference | null;
}
