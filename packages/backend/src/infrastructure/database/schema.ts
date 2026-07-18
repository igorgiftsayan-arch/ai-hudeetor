import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    emailNormalized: text('email_normalized').notNull(),
    status: text('status').notNull(),
    onboardingStatus: text('onboarding_status').notNull(),
    registrationIdempotencyKey: text('registration_idempotency_key').notNull(),
    registrationRequestHash: text('registration_request_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_users_email_normalized').on(table.emailNormalized),
    uniqueIndex('uq_users_registration_idempotency_key').on(
      table.registrationIdempotencyKey,
    ),
    check(
      'ck_users_status',
      sql`${table.status} in ('active', 'disabled', 'deleted')`,
    ),
    check(
      'ck_users_onboarding_status',
      sql`${table.onboardingStatus} in ('registered', 'profileReady', 'personaReady', 'completed')`,
    ),
  ],
);

export const passwordCredentials = pgTable('password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userConsents = pgTable(
  'user_consents',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    consentType: text('consent_type').notNull(),
    documentVersion: text('document_version').notNull(),
    source: text('source').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_user_consents_user_type_version').on(
      table.userId,
      table.consentType,
      table.documentVersion,
    ),
    index('idx_user_consents_user_id').on(table.userId),
    check(
      'ck_user_consents_type',
      sql`${table.consentType} in ('terms', 'privacy', 'aiWellnessNotice', 'aiProviderProcessing')`,
    ),
    check('ck_user_consents_source', sql`${table.source} in ('web')`),
  ],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    registrationIdempotencyKey: text('registration_idempotency_key'),
    accessTokenHash: text('access_token_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    accessExpiresAt: timestamp('access_expires_at', {
      withTimezone: true,
    }).notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', {
      withTimezone: true,
    }).notNull(),
    rotatedFromId: uuid('rotated_from_id'),
    replacedById: uuid('replaced_by_id'),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: text('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_user_sessions_access_token_hash').on(table.accessTokenHash),
    uniqueIndex('uq_user_sessions_refresh_token_hash').on(
      table.refreshTokenHash,
    ),
    uniqueIndex('uq_user_sessions_rotated_from_id').on(table.rotatedFromId),
    uniqueIndex('uq_user_sessions_replaced_by_id').on(table.replacedById),
    index('idx_user_sessions_user_id').on(table.userId),
    index('idx_user_sessions_family_id').on(table.familyId),
    index('idx_user_sessions_registration_idempotency_key').on(
      table.registrationIdempotencyKey,
    ),
    index('idx_user_sessions_access_expires_at').on(table.accessExpiresAt),
    index('idx_user_sessions_refresh_expires_at').on(table.refreshExpiresAt),
    foreignKey({
      columns: [table.rotatedFromId],
      foreignColumns: [table.id],
      name: 'fk_user_sessions_rotated_from_id',
    }),
    foreignKey({
      columns: [table.replacedById],
      foreignColumns: [table.id],
      name: 'fk_user_sessions_replaced_by_id',
    }),
    check(
      'ck_user_sessions_expiry',
      sql`${table.refreshExpiresAt} > ${table.accessExpiresAt}`,
    ),
  ],
);
