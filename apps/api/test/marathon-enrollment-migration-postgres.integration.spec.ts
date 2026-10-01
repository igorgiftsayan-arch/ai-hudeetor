import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService } from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const migrationPath = resolve(__dirname, '../../../database/migrations');

describeWithDatabase('Migrations 0020-0021 release-shaped upgrade', () => {
  let admin: DatabaseService;
  const schemas: string[] = [];

  beforeAll(() => {
    admin = new DatabaseService(databaseUrl!);
  });

  afterAll(async () => {
    for (const schema of schemas)
      await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.onApplicationShutdown();
  });

  it('preserves one active legacy marathon, membership and token ledger', async () => {
    const { db, schema } = await releaseSchema();
    const fixture = await legacyFixture(db, 1);
    const before = await snapshot(db, fixture.userId);

    await db.query(
      await readFile(
        resolve(migrationPath, '0020_marathon_enrollment_lifecycle.sql'),
        'utf8',
      ),
    );

    const after = await snapshot(db, fixture.userId);
    expect(after).toEqual(before);
    const lifecycle = await db.query<{
      status: string;
      duration_days: number;
      starts_on: string;
      ends_on: string;
    }>(
      `select status,duration_days,starts_on::text,ends_on::text
         from marathons where id=$1`,
      [fixture.marathonId],
    );
    expect(lifecycle.rows[0]).toEqual({
      status: 'inProgress',
      duration_days: 5,
      starts_on: fixture.startsOn,
      ends_on: fixture.endsOn,
    });
    await db.query(
      await readFile(
        resolve(migrationPath, '0021_marathon_finale_baseline_fix.sql'),
        'utf8',
      ),
    );
    expect(await snapshot(db, fixture.userId)).toEqual(before);
    await db.onApplicationShutdown();
    expect(schema).toBeTruthy();
  });

  it('fails before DDL when more than one legacy marathon is unfinished', async () => {
    const { db, schema } = await releaseSchema();
    const first = await legacyFixture(db, 1);
    await legacyFixture(db, 2);
    const before = await db.query<{
      id: string;
      starts_on: string;
      ends_on: string;
    }>('select id,starts_on::text,ends_on::text from marathons order by id');

    await expect(
      db.query(
        await readFile(
          resolve(migrationPath, '0020_marathon_enrollment_lifecycle.sql'),
          'utf8',
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'at most one unfinished legacy marathon',
      ),
    });

    const after = await db.query<{
      id: string;
      starts_on: string;
      ends_on: string;
    }>('select id,starts_on::text,ends_on::text from marathons order by id');
    expect(after.rows).toEqual(before.rows);
    expect(after.rows.some((row) => row.id === first.marathonId)).toBe(true);
    const statusColumn = await db.query(
      `select 1 from information_schema.columns
        where table_schema=$1 and table_name='marathons' and column_name='status'`,
      [schema],
    );
    expect(statusColumn.rowCount).toBe(0);
    await db.onApplicationShutdown();
  });

  async function releaseSchema() {
    const schema = `marathon_upgrade_${randomUUID().replaceAll('-', '')}`;
    schemas.push(schema);
    await admin.query(`create schema "${schema}"`);
    const url = new URL(databaseUrl!);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    const db = new DatabaseService(url.toString());
    const migrations = (await readdir(migrationPath))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name < '0020_')
      .sort();
    for (const name of migrations)
      await db.query(await readFile(resolve(migrationPath, name), 'utf8'));
    return { db, schema };
  }
});

async function legacyFixture(db: DatabaseService, offset: number) {
  const userId = randomUUID();
  const walletId = randomUUID();
  const marathonId = randomUUID();
  const teamId = randomUUID();
  const membershipId = randomUUID();
  const dates = await db.query<{ starts_on: string; ends_on: string }>(
    `select (current_date+$1::int)::text starts_on,
            (current_date+$1::int+4)::text ends_on`,
    [offset],
  );
  const startsOn = dates.rows[0]!.starts_on;
  const endsOn = dates.rows[0]!.ends_on;
  await db.query(
    `insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash)
     values($1,$2,'active','completed',$3,'request-hash')`,
    [userId, `${userId}@example.test`, randomUUID()],
  );
  await db.query(`insert into token_wallets(id,user_id) values($1,$2)`, [
    walletId,
    userId,
  ]);
  await db.query(
    `insert into token_transactions(
       id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id
     ) values($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)`,
    [randomUUID(), walletId, userId, randomUUID()],
  );
  await db.query(
    `insert into marathons(id,name,starts_on,ends_on,timezone,created_by_user_id)
     values($1,'Legacy',$2,$3,'UTC',$4)`,
    [marathonId, startsOn, endsOn, userId],
  );
  await db.query(
    `insert into marathon_teams(id,marathon_id,name,join_code_hash)
     values($1,$2,'Legacy team',$3)`,
    [teamId, marathonId, randomUUID()],
  );
  await db.query(
    `insert into marathon_memberships(id,marathon_id,team_id,user_id,role)
     values($1,$2,$3,$4,'captain')`,
    [membershipId, marathonId, teamId, userId],
  );
  return { userId, marathonId, startsOn, endsOn };
}

async function snapshot(db: DatabaseService, userId: string) {
  const result = await db.query<{
    users: number;
    memberships: number;
    ledger_rows: number;
    balance: number;
  }>(
    `select
       (select count(*)::int from users where id=$1) users,
       (select count(*)::int from marathon_memberships where user_id=$1) memberships,
       (select count(*)::int from token_transactions where user_id=$1) ledger_rows,
       (select coalesce(sum(amount_tokens),0)::int from token_transactions where user_id=$1) balance`,
    [userId],
  );
  return result.rows[0];
}
