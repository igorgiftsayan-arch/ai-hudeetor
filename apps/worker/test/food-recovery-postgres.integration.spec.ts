import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { DatabaseService } from '@atlas/backend';
import { FoodAnalysisProcessor } from '../src/food-analysis.processor';
import { AutomaticRecoveryService } from '../src/automatic-recovery.service';

// Explicit opt-in, matching the existing API PostgreSQL integration harness.
// Uses a fresh schema and real migrations; never truncates shared tables.
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const successfulResult = {
  recognized: {
    kind: 'food',
    items: [{ name: 'synthetic rice' }],
    uncertaintyNotes: [],
  },
  suitability: {
    status: 'insufficientData',
    source: 'none',
    observations: [],
    missingData: [],
  },
};
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((done) => {
    release = done;
  });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Barrier timeout: ${label}`)),
          8_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function until(predicate: () => Promise<boolean>, label: string) {
  // Observe actual PostgreSQL state rather than assume scheduling after a sleep.
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise<void>((done) => setImmediate(done));
  }
  throw new Error(`State wait timeout: ${label}`);
}

describeWithDatabase(
  'Food provider recovery PostgreSQL concurrency gate',
  () => {
    let admin: DatabaseService;
    let observer: DatabaseService;
    let worker: DatabaseService;
    let sweeper: DatabaseService;
    let schema: string;
    let workerName: string;
    let sweepName: string;

    beforeEach(async () => {
      schema = `food_recovery_${randomUUID().replaceAll('-', '')}`;
      workerName = `${schema}_worker`;
      sweepName = `${schema}_sweep`;
      admin = new DatabaseService(databaseUrl!);
      await admin.query(`create schema "${schema}"`);
      function scoped(applicationName: string) {
        const url = new URL(databaseUrl!);
        url.searchParams.set(
          'options',
          `-c search_path=${schema},public -c statement_timeout=12000 -c lock_timeout=10000`,
        );
        url.searchParams.set('application_name', applicationName);
        return new DatabaseService(url.toString());
      }
      observer = scoped(`${schema}_observer`);
      worker = scoped(workerName);
      sweeper = scoped(sweepName);
      const migrations = resolve(__dirname, '../../../database/migrations');
      for (const name of (await readdir(migrations))
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        await observer.query(await readFile(resolve(migrations, name), 'utf8'));
      }
      jest.spyOn(S3Client.prototype, 'send').mockImplementation((async () => ({
        ContentType: 'image/jpeg',
        Body: {
          transformToByteArray: async () => new Uint8Array([255, 216, 255]),
        },
      })) as never);
    }, 30_000);

    afterEach(async () => {
      jest.restoreAllMocks();
      await Promise.all(
        [worker, sweeper, observer]
          .filter(Boolean)
          .map((db) => db.onApplicationShutdown()),
      );
      if (admin) {
        if (schema)
          await admin.query(`drop schema if exists "${schema}" cascade`);
        await admin.onApplicationShutdown();
      }
    }, 30_000);

    it('serializes actual submission and requeue, never leaving queued plus submitted receipt', async () => {
      const fixture = await seed();
      const lockKey = Math.floor(Math.random() * 2_000_000_000);
      const lockHeld = gate();
      const unlock = gate();
      const postEntered = gate();
      const accept = gate();
      // A database trigger pauses the real receipt UPDATE before its commit.
      // It changes no business values. This barrier also works against the old
      // autocommit implementation and exposes its cross-table requeue race.
      await observer.query(`create function pause_test_submission() returns trigger language plpgsql as $$
      begin
        if NEW.submission_state='submitting' and OLD.submission_state='prepared' then
          perform pg_advisory_xact_lock(${lockKey});
        end if;
        return NEW;
      end $$;
      create trigger pause_test_submission after update on food_analysis_request_receipts
      for each row execute function pause_test_submission()`);
      const holding = observer.transaction(async (client) => {
        await client.query('select pg_advisory_xact_lock($1)', [lockKey]);
        lockHeld.release();
        await bounded(unlock.promise, 'release submission lock');
      });
      await bounded(lockHeld.promise, 'advisory lock acquired');
      const sourceRead = jest.spyOn(S3Client.prototype, 'send');
      sourceRead.mockImplementation((async () => {
        await observer.query(
          "update food_analyses set updated_at=now()-interval '3 minutes' where id=$1",
          [fixture.analysisId],
        );
        return {
          ContentType: 'image/jpeg',
          Body: {
            transformToByteArray: async () => new Uint8Array([255, 216, 255]),
          },
        };
      }) as never);
      const fetcher = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (_url, init) => {
          if (init?.method === 'POST') {
            postEntered.release();
            await bounded(accept.promise, 'provider acceptance');
            return json({ request_id: fixture.providerId });
          }
          return json({
            status: 'success',
            result: [JSON.stringify(successfulResult)],
          });
        });
      const processing = processor(worker).process(job(fixture.outboxId));
      // Attach rejection handlers immediately while the independent sessions run.
      const processed = processing.then(
        () => undefined,
        (error: unknown) => error,
      );
      let swept: Promise<unknown> | undefined;
      try {
        await until(
          () => waiting(workerName, 'advisory'),
          'worker receipt UPDATE at barrier',
        );
        let sweepFinished = false;
        swept = new AutomaticRecoveryService(sweeper).sweep().then(
          () => {
            sweepFinished = true;
          },
          (error: unknown) => {
            sweepFinished = true;
            throw error;
          },
        );
        void swept.catch(() => undefined);
        await until(
          async () => sweepFinished || (await waiting(sweepName)),
          'sweeper completed or blocked on operation',
        );
        unlock.release();
        await holding;
        await bounded(postEntered.promise, 'one provider POST');
        await bounded(swept, 'sweep after submit commit');
        const state = await observer.query<{
          status: string;
          submission_state: string;
        }>(
          'select a.status,r.submission_state from food_analyses a join food_analysis_request_receipts r on r.food_analysis_id=a.id where a.id=$1',
          [fixture.analysisId],
        );
        // The broken interleaving produces queued/submitting here. Depending on
        // who obtains the operation lock first, fixed code may be processing or
        // outcomeUnknown, but it must not requeue an already sent request.
        expect(state.rows[0]?.status).not.toBe('queued');
        expect(['submitting', 'ambiguous']).toContain(
          state.rows[0]?.submission_state,
        );
        accept.release();
        expect(
          await bounded(processed, 'original finalization'),
        ).toBeUndefined();
        await processor(sweeper).process(job(fixture.outboxId));
        expect(
          fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
        ).toHaveLength(1);
        await expectOneConfirmation(fixture.analysisId);
      } finally {
        unlock.release();
        accept.release();
        await Promise.allSettled([
          holding,
          processed,
          ...(swept ? [swept] : []),
        ]);
      }
    }, 30_000);

    it('recovers late accepted after sweep and crash with one terminal effect under concurrent replay', async () => {
      const fixture = await seed();
      const postEntered = gate();
      const accept = gate();
      let crashAfterAcceptance = false;
      const scheduledTimers = jest.spyOn(global, 'setTimeout');
      const transaction = worker.transaction.bind(worker);
      jest.spyOn(worker, 'transaction').mockImplementation(async (callback) => {
        const result = await transaction(callback);
        // Simulate losing the worker immediately AFTER its real acceptance
        // transaction commits, not replacing receipt/outbox SQL with test SQL.
        if (crashAfterAcceptance) {
          crashAfterAcceptance = false;
          throw new Error('simulated crash after accepted commit');
        }
        return result;
      });
      const fetcher = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (_url, init) => {
          if (init?.method === 'POST') {
            postEntered.release();
            await bounded(accept.promise, 'late acceptance');
            crashAfterAcceptance = true;
            return json({ request_id: fixture.providerId });
          }
          return json({
            status: 'success',
            result: [JSON.stringify(successfulResult)],
          });
        });
      const processing = processor(worker).process(job(fixture.outboxId));
      const processed = processing.then(
        () => undefined,
        (error: unknown) => error,
      );
      try {
        await bounded(postEntered.promise, 'provider request submitted');
        await observer.query(
          "update food_analyses set updated_at=now()-interval '3 minutes' where id=$1",
          [fixture.analysisId],
        );
        await new AutomaticRecoveryService(sweeper).sweep();
        const ambiguous = await observer.query<{
          status: string;
          submission_state: string;
        }>(
          'select a.status,r.submission_state from food_analyses a join food_analysis_request_receipts r on r.food_analysis_id=a.id where a.id=$1',
          [fixture.analysisId],
        );
        expect(ambiguous.rows[0]).toEqual({
          status: 'outcomeUnknown',
          submission_state: 'ambiguous',
        });
        accept.release();
        expect(await bounded(processed, 'crashed worker')).toEqual(
          new Error('simulated crash after accepted commit'),
        );
        const receipt = await observer.query<{
          submission_state: string;
          provider_request_id: string;
        }>(
          'select submission_state,provider_request_id from food_analysis_request_receipts where food_analysis_id=$1',
          [fixture.analysisId],
        );
        expect(receipt.rows[0]).toEqual({
          submission_state: 'accepted',
          provider_request_id: fixture.providerId,
        });
        const events = await observer.query<{ id: string }>(
          "select id from outbox_messages where aggregate_id=$1 and event_type='food.analysis_reconciliation_requested.v1'",
          [fixture.analysisId],
        );
        expect(events.rows).toHaveLength(1);
        await new AutomaticRecoveryService(sweeper).sweep();
        const restart = processor(sweeper);
        const duplicate = processor(observer);
        await Promise.all([
          restart.reconcile(job(events.rows[0]!.id)),
          duplicate.reconcile(job(events.rows[0]!.id)),
        ]);
        await restart.reconcile(job(events.rows[0]!.id));
        expect(
          fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
        ).toHaveLength(1);
        await expectOneConfirmation(fixture.analysisId);
      } finally {
        accept.release();
        await processed;
        // A real process crash discards its provider timeout as well.
        // Clean up that observed timer without faking the running clock.
        scheduledTimers.mock.calls.forEach((args, index) => {
          if (args[1] === 15_000) {
            const result = scheduledTimers.mock.results[index];
            if (result?.type === 'return') clearTimeout(result.value);
          }
        });
      }
    }, 30_000);

    function processor(database: DatabaseService) {
      return new FoodAnalysisProcessor(database, {
        provider: 'genapi',
        fakeMode: 'success',
        apiKey: 'synthetic-key',
        nativeBaseUrl: 'https://provider.invalid/api/v1',
        networkId: 'synthetic-vision',
        modelVersion: 'synthetic-v1',
        timeoutMs: 15_000,
        s3: {
          endpoint: 'https://storage.invalid',
          region: 'test',
          bucket: 'test',
          accessKeyId: 'test',
          secretAccessKey: 'test',
          forcePathStyle: true,
        },
      });
    }
    async function waiting(applicationName: string, event?: string) {
      const rows = await observer.query<{ waiting: boolean }>(
        "select exists(select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock' and ($2::text is null or lower(wait_event)=$2)) as waiting",
        [applicationName, event ?? null],
      );
      return rows.rows[0]?.waiting === true;
    }
    async function expectOneConfirmation(analysisId: string) {
      const state = await observer.query<{ status: string }>(
        'select status from food_analyses where id=$1',
        [analysisId],
      );
      expect(state.rows[0]?.status).toBe('analyzed');
      const ledger = await observer.query<{
        entry_type: string;
        count: string;
      }>(
        'select entry_type,count(*)::text as count from token_transactions where food_analysis_id=$1 group by entry_type order by entry_type',
        [analysisId],
      );
      expect(ledger.rows).toEqual([
        { entry_type: 'aiConfirmation', count: '1' },
        { entry_type: 'aiReservation', count: '1' },
      ]);
    }
    async function seed() {
      const userId = randomUUID();
      const walletId = randomUUID();
      const imageId = randomUUID();
      const analysisId = randomUUID();
      const outboxId = randomUUID();
      await observer.query(
        "insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",
        [userId, `${userId}@example.test`, randomUUID()],
      );
      await observer.query(
        'insert into token_wallets(id,user_id) values($1,$2)',
        [walletId, userId],
      );
      await observer.query(
        "insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id) values($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)",
        [randomUUID(), walletId, userId, randomUUID()],
      );
      await observer.query(
        "insert into uploaded_images(id,user_id,purpose,object_key,content_type,size_bytes,sha256,status) values($1,$2,'foodAnalysis',$3,'image/jpeg',3,$4,'available')",
        [imageId, userId, `synthetic/${imageId}`, '0'.repeat(64)],
      );
      await observer.query(
        "insert into food_analyses(id,user_id,uploaded_image_id,status,runtime_adapter) values($1,$2,$3,'queued','genapi')",
        [analysisId, userId, imageId],
      );
      await observer.query(
        "insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,food_analysis_id) values($1,$2,$3,'aiReservation',-5,'foodAnalysis',$4,$4)",
        [randomUUID(), walletId, userId, analysisId],
      );
      await observer.query(
        "insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values($1,'food.analysis_requested.v1','foodAnalysis',$2,$3::jsonb,now(),now(),0)",
        [outboxId, analysisId, JSON.stringify({ analysisId })],
      );
      return { analysisId, outboxId, providerId: `synthetic-${analysisId}` };
    }
  },
);
function job(outboxId: string) {
  return { data: { outboxId } } as Parameters<
    FoodAnalysisProcessor['process']
  >[0];
}
function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
