import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
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

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull(),
  displayName: text('display_name'),
  targetWeightKg: numeric('target_weight_kg', {
    precision: 5,
    scale: 2,
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const aiMemoryExtractions = pgTable(
  'ai_memory_extractions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceMessageId: uuid('source_message_id').notNull(),
    status: text('status').notNull(),
    factsWritten: integer('facts_written').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_ai_memory_extractions_user_source').on(
      table.userId,
      table.sourceMessageId,
    ),
    index('idx_ai_memory_extractions_user_created').on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    check(
      'ck_ai_memory_extractions_status',
      sql`${table.status} in ('completed')`,
    ),
    check(
      'ck_ai_memory_extractions_facts_written',
      sql`${table.factsWritten} >= 0`,
    ),
  ],
);

export const aiMemories = pgTable(
  'ai_memories',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    source: text('source').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    sourceMessageId: uuid('source_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_ai_memories_user_category_key_active')
      .on(table.userId, table.category, table.key)
      .where(sql`${table.deletedAt} is null`),
    index('idx_ai_memories_user_active')
      .on(table.userId, table.category, table.updatedAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    check(
      'ck_ai_memories_category',
      sql`${table.category} in ('preference','restriction','trigger','supportStrategy','goal','communicationPreference')`,
    ),
    check(
      'ck_ai_memories_source',
      sql`${table.source} in ('conversation','profile','system')`,
    ),
    check(
      'ck_ai_memories_confidence',
      sql`${table.confidence} between 0 and 1`,
    ),
  ],
);

export const aiDailyStates = pgTable(
  'ai_daily_states',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_ai_daily_states_user_local_date').on(
      table.userId,
      table.localDate,
    ),
    index('idx_ai_daily_states_user_local_date').on(
      table.userId,
      table.localDate,
      table.id,
    ),
    check(
      'ck_ai_daily_states_status',
      sql`${table.status} in ('notStarted','inProgress','completed')`,
    ),
    check(
      'ck_ai_daily_states_timestamps',
      sql`(${table.status} = 'notStarted' and ${table.startedAt} is null and ${table.completedAt} is null)
          or (${table.status} = 'inProgress' and ${table.startedAt} is not null and ${table.completedAt} is null)
          or (${table.status} = 'completed' and ${table.startedAt} is not null and ${table.completedAt} is not null)`,
    ),
  ],
);

export const aiPreferences = pgTable('ai_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  personaId: text('persona_id').notNull(),
  strictness: text('strictness').notNull(),
  responseLength: text('response_length').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: uuid('id').primaryKey(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_outbox_messages_pending').on(table.availableAt, table.createdAt),
  ],
);
