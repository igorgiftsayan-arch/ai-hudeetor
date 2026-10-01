import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import { IdentityRepository } from '../application/identity-repository';
import type {
  CreateIdentitySessionInput,
  RotateIdentitySessionInput,
  RotateIdentitySessionResult,
  CreateIdentityEmailTokenInput,
} from '../application/identity-repository';
import { identityErrors } from '../domain/identity-error';
import type {
  IdentitySessionRecord,
  OnboardingStatus,
  RegisteredIdentity,
} from '../domain/identity-types';

interface CredentialRow {
  id: string;
  email_normalized: string;
  onboarding_status: OnboardingStatus;
  registration_idempotency_key: string;
  registration_request_hash: string;
  password_hash: string;
  email_verified: boolean;
}

interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  access_token_hash: string;
  refresh_token_hash: string;
  registration_idempotency_key: string | null;
  access_expires_at: Date;
  refresh_expires_at: Date;
  rotated_at: Date | null;
  revoked_at: Date | null;
  onboarding_status?: OnboardingStatus;
  email_verified?: boolean;
}

export class PostgresIdentityRepository extends IdentityRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async register(
    identity: RegisteredIdentity,
    passwordHash: string,
    session: CreateIdentitySessionInput,
    verification?: CreateIdentityEmailTokenInput,
  ) {
    try {
      return await this.database.transaction(async (client) => {
        await client.query(
          `insert into users
            (id, email_normalized, status, onboarding_status,
             registration_idempotency_key, registration_request_hash)
           values ($1, $2, 'active', $3, $4, $5)`,
          [
            identity.id,
            identity.emailNormalized,
            identity.onboardingStatus,
            identity.registrationIdempotencyKey,
            identity.registrationRequestHash,
          ],
        );
        await client.query(
          `insert into password_credentials (user_id, password_hash)
           values ($1, $2)`,
          [identity.id, passwordHash],
        );
        for (const consent of identity.consents) {
          await client.query(
            `insert into user_consents
              (id, user_id, consent_type, document_version, source)
             values (gen_random_uuid(), $1, $2, $3, 'web')`,
            [identity.id, consent.consentType, consent.documentVersion],
          );
        }
        const storedSession = await this.insertSession(client, session);
        if (verification)
          await this.insertEmailToken(client, identity.id, verification);
        return { user: identity, session: storedSession };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'uq_users_email_normalized')) {
        throw identityErrors.emailAlreadyRegistered();
      }
      if (isUniqueViolation(error, 'uq_users_registration_idempotency_key')) {
        throw identityErrors.idempotencyKeyReused();
      }
      throw error;
    }
  }

  async findCredentialsByEmail(emailNormalized: string) {
    return this.findCredentials('u.email_normalized = $1', emailNormalized);
  }

  async findCredentialsByRegistrationIdempotencyKey(
    registrationIdempotencyKey: string,
  ) {
    return this.findCredentials(
      'u.registration_idempotency_key = $1',
      registrationIdempotencyKey,
    );
  }

  private async findCredentials(predicate: string, value: string) {
    const result = await this.database.query<CredentialRow>(
      `select u.id, u.email_normalized, u.onboarding_status,
              (u.email_verified_at is not null) email_verified,
              u.registration_idempotency_key, u.registration_request_hash,
              pc.password_hash
         from users u
         join password_credentials pc on pc.user_id = u.id
        where ${predicate} and u.status = 'active'`,
      [value],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      user: {
        id: row.id,
        emailNormalized: row.email_normalized,
        onboardingStatus: row.onboarding_status,
        registrationIdempotencyKey: row.registration_idempotency_key,
        registrationRequestHash: row.registration_request_hash,
        consents: [],
        emailVerified: row.email_verified,
      },
      passwordHash: row.password_hash,
    };
  }

  async createSession(input: CreateIdentitySessionInput) {
    return this.database.transaction((client) =>
      this.insertSession(client, input),
    );
  }

  override async createSessionIfCredentialCurrent(
    input: CreateIdentitySessionInput,
    expectedPasswordHash: string,
  ): Promise<IdentitySessionRecord | null> {
    return this.database.transaction(async (client) => {
      await client.query('select id from users where id=$1 for update', [
        input.userId,
      ]);
      const credential = await client.query<{ password_hash: string }>(
        'select password_hash from password_credentials where user_id=$1',
        [input.userId],
      );
      if (credential.rows[0]?.password_hash !== expectedPasswordHash)
        return null;
      return this.insertSession(client, input);
    });
  }

  async replaceRegistrationSession(
    userId: string,
    registrationIdempotencyKey: string,
    input: CreateIdentitySessionInput,
  ) {
    return this.database.transaction(async (client) => {
      await client.query('select id from users where id = $1 for update', [
        userId,
      ]);
      await client.query(
        `update user_sessions
            set revoked_at = coalesce(revoked_at, now()), revoke_reason = 'registration_retry'
          where user_id = $1 and family_id in (
            select family_id from user_sessions
             where user_id = $1 and registration_idempotency_key = $2
          )
            and revoked_at is null`,
        [userId, registrationIdempotencyKey],
      );
      return this.insertSession(client, { ...input, userId });
    });
  }

  async findByAccessHash(accessTokenHash: string) {
    const result = await this.database.query<SessionRow>(
      `select s.*, u.onboarding_status,
              (u.email_verified_at is not null) email_verified
         from user_sessions s
         join users u on u.id = s.user_id
        where s.access_token_hash = $1
          and s.access_expires_at > now()
          and s.revoked_at is null
          and u.status = 'active'`,
      [accessTokenHash],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async rotateSession(
    input: RotateIdentitySessionInput,
  ): Promise<RotateIdentitySessionResult> {
    return this.database.transaction(async (client) => {
      const result = await client.query<SessionRow>(
        `select s.*, u.onboarding_status,
                (u.email_verified_at is not null) email_verified
           from user_sessions s
           join users u on u.id = s.user_id
          where s.refresh_token_hash = $1
          for update of s`,
        [input.currentRefreshTokenHash],
      );
      const current = result.rows[0];
      if (!current || current.refresh_expires_at <= new Date()) {
        return { kind: 'invalid' };
      }
      if (current.rotated_at || current.revoked_at) {
        await client.query(
          `update user_sessions
              set revoked_at = coalesce(revoked_at, now()), revoke_reason = 'refresh_reuse'
            where family_id = $1`,
          [current.family_id],
        );
        return { kind: 'reused' };
      }
      const nextInput: CreateIdentitySessionInput = {
        ...input.nextSession,
        userId: current.user_id,
        familyId: current.family_id,
        rotatedFromId: current.id,
        accessExpiresAt: new Date(
          Math.min(
            input.nextSession.accessExpiresAt.getTime(),
            current.refresh_expires_at.getTime() - 1,
          ),
        ),
        refreshExpiresAt: current.refresh_expires_at,
      };
      const next = await this.insertSession(client, nextInput);
      await client.query(
        `update user_sessions
            set rotated_at = now(), replaced_by_id = $2
          where id = $1`,
        [current.id, next.id],
      );
      return {
        kind: 'rotated',
        session: next,
        onboardingStatus: current.onboarding_status!,
        emailVerified: current.email_verified ?? false,
      };
    });
  }

  async revokeByTokenHashes(
    accessTokenHash: string | null,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.database.query(
      `update user_sessions
          set revoked_at = coalesce(revoked_at, now()), revoke_reason = 'logout'
        where family_id = (
          select family_id from user_sessions
           where access_token_hash = $1 or refresh_token_hash = $2
           limit 1
        )`,
      [accessTokenHash, refreshTokenHash],
    );
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.database.query(
      `update user_sessions
          set revoked_at = coalesce(revoked_at, now()), revoke_reason = 'family_revoked'
        where family_id = $1`,
      [familyId],
    );
  }

  override async createEmailVerification(
    userId: string,
    input: CreateIdentityEmailTokenInput,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const locked = await client.query(
        `select id from users where id=$1 and status='active' and email_verified_at is null for update`,
        [userId],
      );
      if (!locked.rowCount) return;
      await this.insertEmailToken(client, userId, input);
    });
  }

  override async createPasswordReset(
    emailNormalized: string,
    input: CreateIdentityEmailTokenInput,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const user = await client.query<{ id: string }>(
        `select id from users where email_normalized=$1 and status='active' for update`,
        [emailNormalized],
      );
      if (!user.rows[0]) return;
      await this.insertEmailToken(client, user.rows[0].id, input);
    });
  }

  override async verifyEmail(tokenHash: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const resolved = await client.query<{ user_id: string }>(
        `select user_id from identity_tokens
          where token_hash=$1 and purpose='emailVerification'`,
        [tokenHash],
      );
      if (!resolved.rows[0]) return false;
      await client.query('select id from users where id=$1 for update', [
        resolved.rows[0].user_id,
      ]);
      const token = await client.query<{ id: string; user_id: string }>(
        `select id,user_id from identity_tokens
          where token_hash=$1 and purpose='emailVerification'
            and consumed_at is null and expires_at > now()
          for update`,
        [tokenHash],
      );
      if (!token.rows[0]) return false;
      await client.query(
        `update identity_tokens set consumed_at=now() where id=$1`,
        [token.rows[0].id],
      );
      await client.query(
        `update users set email_verified_at=coalesce(email_verified_at,now()), updated_at=now() where id=$1`,
        [token.rows[0].user_id],
      );
      return true;
    });
  }

  override async resetPassword(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const resolved = await client.query<{ user_id: string }>(
        `select user_id from identity_tokens
          where token_hash=$1 and purpose='passwordReset'`,
        [tokenHash],
      );
      if (!resolved.rows[0]) return false;
      await client.query('select id from users where id=$1 for update', [
        resolved.rows[0].user_id,
      ]);
      const token = await client.query<{ id: string; user_id: string }>(
        `select id,user_id from identity_tokens
          where token_hash=$1 and purpose='passwordReset'
            and consumed_at is null and expires_at > now()
          for update`,
        [tokenHash],
      );
      if (!token.rows[0]) return false;
      await client.query(
        `update password_credentials set password_hash=$2, updated_at=now() where user_id=$1`,
        [token.rows[0].user_id, passwordHash],
      );
      await client.query(`update identity_tokens set consumed_at=now() where id=$1`, [
        token.rows[0].id,
      ]);
      await client.query(
        `update identity_tokens set consumed_at=coalesce(consumed_at,now())
          where user_id=$1 and purpose='passwordReset' and consumed_at is null`,
        [token.rows[0].user_id],
      );
      await client.query(
        `update user_sessions set revoked_at=coalesce(revoked_at,now()), revoke_reason='password_reset' where user_id=$1 and revoked_at is null`,
        [token.rows[0].user_id],
      );
      return true;
    });
  }

  override async hasValidPasswordResetToken(
    tokenHash: string,
  ): Promise<boolean> {
    const result = await this.database.query(
      `select 1 from identity_tokens
        where token_hash=$1 and purpose='passwordReset'
          and consumed_at is null and expires_at > now()`,
      [tokenHash],
    );
    return Boolean(result.rows[0]);
  }

  async acceptWellnessNoticeAndAdvanceProfile(
    client: PoolClient,
    input: { userId: string; documentVersion: string },
  ): Promise<OnboardingStatus> {
    await client.query(
      `insert into user_consents (id, user_id, consent_type, document_version, source)
       values (gen_random_uuid(), $1, 'aiWellnessNotice', $2, 'web')
       on conflict (user_id, consent_type, document_version) do nothing`,
      [input.userId, input.documentVersion],
    );
    const result = await client.query<{ onboarding_status: OnboardingStatus }>(
      `update users
          set onboarding_status = case
            when onboarding_status = 'registered' then 'profileReady'
            else onboarding_status
          end,
          updated_at = now()
        where id = $1 and status = 'active'
        returning onboarding_status`,
      [input.userId],
    );
    const status = result.rows[0]?.onboarding_status;
    if (!status) throw identityErrors.sessionInvalid();
    return status;
  }

  async advanceToPersonaReady(
    client: PoolClient,
    userId: string,
  ): Promise<OnboardingStatus> {
    const result = await client.query<{ onboarding_status: OnboardingStatus }>(
      `update users
          set onboarding_status = case
            when onboarding_status = 'profileReady' then 'personaReady'
            else onboarding_status
          end,
          updated_at = now()
        where id = $1 and status = 'active'
        returning onboarding_status`,
      [userId],
    );
    const status = result.rows[0]?.onboarding_status;
    if (!status) throw identityErrors.sessionInvalid();
    return status;
  }

  async advanceToCompleted(
    client: PoolClient,
    userId: string,
  ): Promise<OnboardingStatus> {
    const result = await client.query<{ onboarding_status: OnboardingStatus }>(
      `update users set onboarding_status = case when onboarding_status = 'personaReady' then 'completed' else onboarding_status end,
          updated_at = now() where id = $1 and status = 'active' returning onboarding_status`,
      [userId],
    );
    const status = result.rows[0]?.onboarding_status;
    if (!status) throw identityErrors.sessionInvalid();
    return status;
  }

  private async insertSession(
    client: PoolClient,
    input: CreateIdentitySessionInput,
  ): Promise<IdentitySessionRecord> {
    const result = await client.query<SessionRow>(
      `insert into user_sessions
        (id, user_id, family_id, access_token_hash, refresh_token_hash,
         access_expires_at, refresh_expires_at, rotated_from_id,
         registration_idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning *`,
      [
        input.id,
        input.userId,
        input.familyId,
        input.accessTokenHash,
        input.refreshTokenHash,
        input.accessExpiresAt,
        input.refreshExpiresAt,
        input.rotatedFromId ?? null,
        input.registrationIdempotencyKey ?? null,
      ],
    );
    return mapSession(result.rows[0]!);
  }

  private async insertEmailToken(
    client: PoolClient,
    userId: string,
    input: CreateIdentityEmailTokenInput,
  ): Promise<void> {
    const purpose =
      input.template === 'verifyEmail' ? 'emailVerification' : 'passwordReset';
    await client.query(
      `update identity_tokens set consumed_at=coalesce(consumed_at,now())
        where user_id=$1 and purpose=$2 and consumed_at is null`,
      [userId, purpose],
    );
    await client.query(
      `insert into identity_tokens (id,user_id,purpose,token_hash,expires_at)
       values ($1,$2,$3,$4,$5)`,
      [input.id, userId, purpose, input.tokenHash, input.expiresAt],
    );
    await client.query(
      `insert into identity_email_deliveries
        (id,user_id,token_id,template,token_ciphertext,token_iv,token_auth_tag)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.deliveryId,
        userId,
        input.id,
        input.template,
        input.tokenCiphertext,
        input.tokenIv,
        input.tokenAuthTag,
      ],
    );
  }
}

function mapSession(row: SessionRow): IdentitySessionRecord & {
  onboardingStatus?: OnboardingStatus;
  emailVerified?: boolean;
} {
  return {
    id: row.id,
    userId: row.user_id,
    familyId: row.family_id,
    registrationIdempotencyKey: row.registration_idempotency_key,
    accessTokenHash: row.access_token_hash,
    refreshTokenHash: row.refresh_token_hash,
    accessExpiresAt: row.access_expires_at,
    refreshExpiresAt: row.refresh_expires_at,
    rotatedAt: row.rotated_at,
    revokedAt: row.revoked_at,
    onboardingStatus: row.onboarding_status,
    emailVerified: row.email_verified,
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === constraint
  );
}
