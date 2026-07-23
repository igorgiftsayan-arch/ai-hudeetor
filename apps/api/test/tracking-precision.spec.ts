import { CreateWeightEntryUseCase } from '../../../packages/backend/src/tracking/application/create-weight-entry.use-case';
import { IdentityError } from '../../../packages/backend/src/identity/domain/identity-error';

describe('weight entry precision', () => {
  it('persists a two-decimal weight without rounding it', async () => {
    let persistedWeight: string | undefined;
    let requestHash = '';
    const client = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes('insert into idempotency_records')) {
          requestHash = params[3] as string;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('from idempotency_records')) {
          return {
            rows: [
              {
                request_hash: requestHash,
                state: 'processing',
                response_body: null,
              },
            ],
          };
        }
        if (sql.includes('select 1 from weight_entries'))
          return { rows: [], rowCount: 0 };
        if (sql.includes('insert into weight_entries'))
          persistedWeight = params[2] as string;
        return { rows: [], rowCount: 1 };
      },
    };
    const database = {
      transaction: (operation: (transaction: typeof client) => unknown) =>
        operation(client),
    };
    const currentUser = {
      execute: async () => ({ userId: '00000000-0000-4000-8000-000000000001' }),
    };
    const useCase = new CreateWeightEntryUseCase(
      database as never,
      currentUser as never,
    );

    await expect(
      useCase.execute({
        accessToken: 'access-token',
        idempotencyKey: 'weight-precision-98-45',
        weightKg: 98.45,
      }),
    ).resolves.toMatchObject({ weightKg: '98.45' });
    expect(persistedWeight).toBe('98.45');
  });

  it('rejects a weight with more than two fractional digits', async () => {
    const useCase = new CreateWeightEntryUseCase(
      {} as never,
      { execute: async () => ({ userId: 'user-1' }) } as never,
    );

    await expect(
      useCase.execute({
        accessToken: 'access-token',
        idempotencyKey: 'weight-precision-98-456',
        weightKg: 98.456,
      }),
    ).rejects.toEqual(
      new IdentityError('VALIDATION_ERROR', 422, 'The weight entry is invalid'),
    );
  });
});
