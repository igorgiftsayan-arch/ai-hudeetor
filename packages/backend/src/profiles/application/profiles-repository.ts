import type { PoolClient } from 'pg';
import type { AiPreference, UserProfile } from '../domain/profile-types';

export abstract class ProfilesRepository {
  abstract upsertProfile(
    client: PoolClient,
    input: UserProfile,
  ): Promise<UserProfile>;

  abstract findProfile(userId: string): Promise<UserProfile | null>;

  abstract findPreference(userId: string): Promise<AiPreference | null>;

  abstract lockPreference(
    client: PoolClient,
    userId: string,
  ): Promise<AiPreference | null>;

  abstract upsertPreference(
    client: PoolClient,
    input: AiPreference,
  ): Promise<AiPreference>;

  abstract insertPersonaSelectedEvent(
    client: PoolClient,
    input: { userId: string; personaId: string },
  ): Promise<void>;
}
