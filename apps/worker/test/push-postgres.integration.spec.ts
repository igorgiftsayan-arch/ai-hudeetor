import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import webpush from 'web-push';
import { DatabaseService } from '@atlas/backend';
import { PushNotificationsService } from '../../../packages/backend/src/notifications/application/push-notifications.service';
import { PushReminderService } from '../src/push-reminder.service';
import { OutboxPublisherService } from '../src/outbox-publisher.service';

const url = process.env.INTEGRATION_DATABASE_URL;
const withDatabase = url ? describe : describe.skip;
withDatabase('Push opt-in, scheduling and delivery on real PostgreSQL', () => {
  let admin: DatabaseService, db: DatabaseService, schema: string;
  let owner: string, other: string;
  let preferences: PushNotificationsService, outsider: PushNotificationsService;
  let worker: PushReminderService;
  let send: jest.SpyInstance;
  const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-device';
  const subscription = {
    endpoint,
    p256dh: 'test-public-key-long-enough',
    auth: 'test-auth-long-enough',
    platform: 'androidPwa',
  };
  beforeEach(async () => {
    admin = new DatabaseService(url!);
    schema = `push_gate_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`create schema "${schema}"`);
    const scoped = new URL(url!);
    scoped.searchParams.set('options', `-c search_path=${schema},public`);
    db = new DatabaseService(scoped.toString());
    const directory = resolve(__dirname, '../../../database/migrations');
    for (const file of (await readdir(directory))
      .filter((file) => file.endsWith('.sql'))
      .sort())
      await db.query(await readFile(resolve(directory, file), 'utf8'));
    owner = randomUUID();
    other = randomUUID();
    for (const id of [owner, other])
      await db.query(
        "insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",
        [id, `${id}@example.test`, randomUUID()],
      );
    preferences = new PushNotificationsService(
      db,
      { execute: async () => ({ userId: owner }) } as never,
      { enabled: true, publicKey: 'test' },
    );
    outsider = new PushNotificationsService(
      db,
      { execute: async () => ({ userId: other }) } as never,
      { enabled: true, publicKey: 'test' },
    );
    jest.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
    send = jest
      .spyOn(webpush, 'sendNotification')
      .mockResolvedValue({ statusCode: 201, headers: {}, body: '' });
    worker = new PushReminderService(db, {
      enabled: true,
      subject: 'mailto:test@example.test',
      publicKey: 'test',
      privateKey: 'test',
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db?.onApplicationShutdown();
    if (schema) await admin.query(`drop schema "${schema}" cascade`);
    await admin?.onApplicationShutdown();
  });
  async function setup(time = '09:00', timezone = 'Asia/Irkutsk') {
    const saved = await preferences.subscribe('owner', subscription);
    await preferences.savePreference('owner', {
      enabled: true,
      localTime: time,
      timezone,
    });
    return saved.id as string;
  }
  async function events() {
    return (
      await db.query<{ id: string; payload: { deliveryId: string } }>(
        "select id,payload from outbox_messages where event_type='notifications.push_delivery_requested.v1' order by created_at",
      )
    ).rows;
  }
  function job(id: string) {
    return { data: { outboxId: id } } as Parameters<
      PushReminderService['process']
    >[0];
  }
  async function queued() {
    await setup();
    await worker.schedule(new Date('2026-09-24T01:00:00Z'));
    return (await events())[0]!;
  }

  it('requires explicit opt-in and keeps subscription lookup/revoke owner scoped', async () => {
    const saved = await preferences.subscribe('owner', subscription);
    await worker.schedule(new Date('2026-09-24T01:00:00Z'));
    expect(await events()).toEqual([]);
    expect(await outsider.lookupSubscription('other', endpoint)).toEqual({
      connected: false,
      subscriptionId: null,
    });
    await expect(
      outsider.subscribe('other', subscription),
    ).rejects.toMatchObject({ code: 'PUSH_SUBSCRIPTION_OWNERSHIP_CONFLICT' });
    await expect(outsider.unsubscribe('other', saved.id)).rejects.toMatchObject(
      { code: 'PUSH_SUBSCRIPTION_NOT_FOUND' },
    );
    await outsider.unsubscribeByEndpoint('other', endpoint);
    expect(
      (await preferences.lookupSubscription('owner', endpoint)).connected,
    ).toBe(true);
    await preferences.savePreference('owner', {
      enabled: true,
      localTime: '09:00',
      timezone: 'Asia/Irkutsk',
    });
    await worker.schedule(new Date('2026-09-24T00:59:00Z'));
    expect(await events()).toEqual([]);
    await worker.schedule(new Date('2026-09-24T01:00:00Z'));
    expect(await events()).toHaveLength(1);
    await preferences.unsubscribeByEndpoint('owner', endpoint);
    expect(
      (await preferences.lookupSubscription('owner', endpoint)).connected,
    ).toBe(false);
  });

  it('keeps the existing five-minute catch-up across local midnight and deduplicates the same due minute', async () => {
    await setup('23:58');
    await worker.schedule(new Date('2026-09-23T16:01:00Z'));
    await worker.schedule(new Date('2026-09-23T16:03:00Z'));
    const delivery = await db.query<{ scheduled_for: Date }>(
      'select scheduled_for from push_deliveries',
    );
    expect(delivery.rows.map((row) => row.scheduled_for.toISOString())).toEqual(
      ['2026-09-23T15:58:00.000Z'],
    );
    expect(await events()).toHaveLength(1);
  });

  it('keeps yesterday and today as separate occurrences while midnight catch-up does not duplicate yesterday', async () => {
    await setup('23:58');
    // Asia/Irkutsk: Sep 23 23:58 -> Sep 24 00:01 -> Sep 24 23:58.
    await worker.schedule(new Date('2026-09-23T15:58:00Z'));
    const yesterday = (await events())[0]!;
    await worker.process(job(yesterday.id));
    await worker.schedule(new Date('2026-09-23T16:01:00Z'));
    expect(await events()).toHaveLength(1);
    await worker.process(job(yesterday.id));
    expect(send).toHaveBeenCalledTimes(1);
    await worker.schedule(new Date('2026-09-24T15:58:00Z'));
    const occurrences = await events();
    expect(occurrences).toHaveLength(2);
    for (const event of occurrences) await worker.process(job(event.id));
    const deliveries = await db.query<{ scheduled_for: Date; status: string; attempt_count: number }>(
      'select scheduled_for,status,attempt_count from push_deliveries order by scheduled_for',
    );
    expect(deliveries.rows.map(row => ({ scheduledFor: row.scheduled_for.toISOString(), status: row.status, attempts: row.attempt_count }))).toEqual([
      { scheduledFor: '2026-09-23T15:58:00.000Z', status: 'delivered', attempts: 1 },
      { scheduledFor: '2026-09-24T15:58:00.000Z', status: 'delivered', attempts: 1 },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(new Set(send.mock.calls.map(call => JSON.parse(call[1]).deliveryId)).size).toBe(2);
  });

  it.each(['disable', 'revoke'] as const)(
    'does not dispatch a queued reminder after %s',
    async (action) => {
      const event = await queued();
      if (action === 'disable')
        await preferences.savePreference('owner', { enabled: false });
      else await preferences.unsubscribeByEndpoint('owner', endpoint);
      await worker.process(job(event.id));
      expect(send).not.toHaveBeenCalled();
      expect(
        (await db.query('select attempt_count from push_deliveries')).rows[0],
      ).toEqual({ attempt_count: 0 });
    },
  );

  it('expires a 410 subscription without retrying it', async () => {
    const event = await queued();
    send.mockRejectedValueOnce({ statusCode: 410 });
    await worker.process(job(event.id));
    await worker.process(job(event.id));
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (await db.query('select status from push_subscriptions')).rows[0],
    ).toEqual({ status: 'expired' });
    expect(
      (await db.query('select status,attempt_count from push_deliveries'))
        .rows[0],
    ).toEqual({ status: 'expired', attempt_count: 1 });
  });

  it('retries a transient delivery with the same neutral payload, then ignores duplicate processing', async () => {
    const event = await queued();
    send.mockRejectedValueOnce({ statusCode: 503 });
    await expect(worker.process(job(event.id))).rejects.toMatchObject({
      statusCode: 503,
    });
    const restarted = new PushReminderService(db, {
      enabled: true,
      subject: 'mailto:test@example.test',
      publicKey: 'test',
      privateKey: 'test',
    });
    await Promise.all([restarted.process(job(event.id)), restarted.process(job(event.id))]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![1]).toBe(send.mock.calls[1]![1]);
    expect(JSON.parse(send.mock.calls[1]![1])).toEqual({
      title: 'AI-друг',
      body: 'Пора ненадолго заглянуть в приложение.',
      url: '/marathon',
      deliveryId: event.payload.deliveryId,
    });
    expect(
      (await db.query('select status,attempt_count from push_deliveries'))
        .rows[0],
    ).toEqual({ status: 'delivered', attempt_count: 2 });
  });

  it('marks interrupted stale dispatch unknown on restart without blindly resending it', async () => {
    const event = await queued();
    await db.query(
      "update push_deliveries set status='processing',attempt_count=1,updated_at=now()-interval '6 minutes' where id=$1",
      [event.payload.deliveryId],
    );
    // Disable scheduling to isolate the restart recovery from clock-dependent new reminders.
    await preferences.savePreference('owner', { enabled: false });
    const interval = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref: () => undefined } as never);
    worker.onModuleInit();
    const deadline = Date.now() + 3000;
    let status = 'processing';
    while (status === 'processing' && Date.now() < deadline) {
      status = (
        await db.query<{ status: string }>(
          'select status from push_deliveries where id=$1',
          [event.payload.deliveryId],
        )
      ).rows[0]!.status;
      if (status === 'processing')
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    interval.mockRestore();
    expect(status).toBe('deliveryUnknown');
    await preferences.savePreference('owner', {
      enabled: true,
      localTime: '09:00',
      timezone: 'Asia/Irkutsk',
    });
    await worker.process(job(event.id));
    expect(send).not.toHaveBeenCalled();
    expect(
      (
        await db.query(
          'select last_error_category,attempt_count from push_deliveries',
        )
      ).rows[0],
    ).toEqual({
      last_error_category: 'workerInterruptedAfterDispatch',
      attempt_count: 1,
    });
  });

  it('honors outbox available_at before adding a push job to the queue', async () => {
    const event = await queued();
    await db.query(
      "update outbox_messages set available_at=now()+interval '1 hour' where id=$1",
      [event.id],
    );
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const publisher = new OutboxPublisherService(db, queue as never);
    await publisher.publish();
    expect(queue.add).not.toHaveBeenCalled();
    await db.query(
      "update outbox_messages set available_at=now()-interval '1 second' where id=$1",
      [event.id],
    );
    await publisher.publish();
    await publisher.publish();
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'push-delivery',
      { outboxId: event.id },
      expect.objectContaining({ jobId: event.id }),
    );
  });
});
