import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { IdentityError } from '../../identity/domain/identity-error';
export class CreateWeightEntryUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
  ) {}
  async execute(input: {
    accessToken: string;
    idempotencyKey: string;
    weightKg: number;
    recordedAt?: string;
  }) {
    const user = await this.currentUser.execute(input.accessToken);
    const requestedRecordedAt = input.recordedAt
      ? new Date(input.recordedAt)
      : undefined;
    if (
      !Number.isFinite(input.weightKg) ||
      input.weightKg < 20 ||
      input.weightKg > 500 ||
      Math.round(input.weightKg * 10) !== input.weightKg * 10 ||
      (requestedRecordedAt && Number.isNaN(requestedRecordedAt.valueOf())) ||
      (requestedRecordedAt && requestedRecordedAt.getTime() > Date.now() + 300000)
    )
      throw new IdentityError(
        'VALIDATION_ERROR',
        422,
        'The weight entry is invalid',
      );
    const payload = {
      weightKg: input.weightKg,
      recordedAt: input.recordedAt ?? null,
    };
    return this.database.transaction(async (client) => {
      const hash = createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
      await client.query(
        `insert into idempotency_records (id,user_id,operation_scope,idempotency_key,request_hash,state) values ($1,$2,'weightEntryCreate',$3,$4,'processing') on conflict do nothing`,
        [randomUUID(), user.userId, input.idempotencyKey, hash],
      );
      const r = await client.query<{
        request_hash: string;
        state: string;
        response_body: {
          id: string;
          weightKg: string;
          recordedAt: string;
          source: 'manual';
        } | null;
      }>(
        `select request_hash,state,response_body from idempotency_records where user_id=$1 and operation_scope='weightEntryCreate' and idempotency_key=$2 for update`,
        [user.userId, input.idempotencyKey],
      );
      const record = r.rows[0]!;
      if (record.request_hash !== hash)
        throw new IdentityError(
          'IDEMPOTENCY_KEY_REUSED',
          409,
          'The idempotency key was already used with another request',
        );
      if (record.state === 'completed' && record.response_body)
        return record.response_body;
      const recordedAt = requestedRecordedAt ?? new Date();
      const first =
        (
          await client.query(
            `select 1 from weight_entries where user_id=$1 limit 1`,
            [user.userId],
          )
        ).rowCount === 0;
      const id = randomUUID();
      await client.query(
        `insert into weight_entries (id,user_id,weight_kg,recorded_at) values ($1,$2,$3,$4)`,
        [id, user.userId, input.weightKg, recordedAt],
      );
      const response = {
        id,
        weightKg: input.weightKg.toFixed(1),
        recordedAt: recordedAt.toISOString(),
        source: 'manual' as const,
      };
      const events = first
        ? [
            [
              'tracking.first_weight_added.v1',
              { userId: user.userId, entryId: id, source: 'manual' },
            ],
            [
              'tracking.weight_added.v1',
              {
                userId: user.userId,
                entryId: id,
                source: 'manual',
                isFirst: true,
              },
            ],
          ]
        : [
            [
              'tracking.weight_added.v1',
              {
                userId: user.userId,
                entryId: id,
                source: 'manual',
                isFirst: false,
              },
            ],
          ];
      for (const [type, event] of events)
        await client.query(
          `insert into outbox_messages (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values ($1,$2,'weightEntry',$3,$4::jsonb,now(),now(),0)`,
          [randomUUID(), type, id, JSON.stringify(event)],
        );
      await client.query(
        `update idempotency_records set state='completed',response_status=201,response_body=$1::jsonb,completed_at=now() where user_id=$2 and operation_scope='weightEntryCreate' and idempotency_key=$3`,
        [JSON.stringify(response), user.userId, input.idempotencyKey],
      );
      return response;
    });
  }
}
