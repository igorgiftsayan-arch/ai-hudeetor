import { randomUUID } from 'node:crypto';
import { DatabaseService } from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI memory PostgreSQL constraints', () => {
  let database: DatabaseService;

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
  });

  afterAll(async () => database.onApplicationShutdown());

  beforeEach(async () => {
    await database.query(
      'truncate table ai_memory_extractions, ai_memories, ai_messages, ai_conversations, user_profiles, users cascade',
    );
  });

  it('stores nullable companion profile fields without requiring values', async () => {
    const userId = await createUser();
    await database.query(
      `insert into user_profiles (user_id,timezone,display_name,target_weight_kg)
       values ($1,'Asia/Irkutsk',null,null)`,
      [userId],
    );

    const result = await database.query<{
      display_name: string | null;
      target_weight_kg: string | null;
    }>(
      'select display_name,target_weight_kg::text from user_profiles where user_id=$1',
      [userId],
    );

    expect(result.rows[0]).toEqual({
      display_name: null,
      target_weight_kg: null,
    });
    await expect(
      database.query(
        'update user_profiles set target_weight_kg=19.99 where user_id=$1',
        [userId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('allows one active fact per owner, category and canonical key', async () => {
    const { userId, messageId } = await createConversationFixture();
    const firstId = randomUUID();
    await insertMemory(firstId, userId, messageId, 'не любит рыбу');

    await expect(
      insertMemory(
        randomUUID(),
        userId,
        messageId,
        'любит рыбу',
      ),
    ).rejects.toMatchObject({ code: '23505' });

    await database.query(
      'update ai_memories set deleted_at=now() where id=$1',
      [firstId],
    );
    await expect(
      insertMemory(randomUUID(), userId, messageId, 'любит рыбу'),
    ).resolves.toBeDefined();
  });

  it('rejects invalid category, source and confidence', async () => {
    const { userId, messageId } = await createConversationFixture();
    for (const [category, source, confidence] of [
      ['medical', 'conversation', 0.9],
      ['preference', 'provider', 0.9],
      ['preference', 'conversation', 1.01],
    ] as const) {
      await expect(
        database.query(
          `insert into ai_memories
            (id,user_id,category,key,value,source,confidence,source_message_id)
           values ($1,$2,$3,'food.fish','value',$4,$5,$6)`,
          [
            randomUUID(),
            userId,
            category,
            source,
            confidence,
            messageId,
          ],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
  });

  it('records one durable extraction receipt per owner and source message', async () => {
    const { userId, messageId } = await createConversationFixture();
    await database.query(
      `insert into ai_memory_extractions
        (id,user_id,source_message_id,status,facts_written)
       values ($1,$2,$3,'completed',1)`,
      [randomUUID(), userId, messageId],
    );

    await expect(
      database.query(
        `insert into ai_memory_extractions
          (id,user_id,source_message_id,status,facts_written)
         values ($1,$2,$3,'completed',0)`,
        [randomUUID(), userId, messageId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  async function createUser(): Promise<string> {
    const userId = randomUUID();
    await database.query(
      `insert into users
        (id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash)
       values ($1,$2,'active','completed',$3,'hash')`,
      [userId, `${userId}@example.test`, randomUUID()],
    );
    return userId;
  }

  async function createConversationFixture(): Promise<{
    userId: string;
    messageId: string;
  }> {
    const userId = await createUser();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    await database.query(
      'insert into ai_conversations (id,user_id) values ($1,$2)',
      [conversationId, userId],
    );
    await database.query(
      `insert into ai_messages (id,conversation_id,role,content)
       values ($1,$2,'user','не люблю рыбу')`,
      [messageId, conversationId],
    );
    return { userId, messageId };
  }

  async function insertMemory(
    id: string,
    userId: string,
    messageId: string,
    value: string,
  ) {
    return database.query(
      `insert into ai_memories
        (id,user_id,category,key,value,source,confidence,source_message_id)
       values ($1,$2,'preference','food.fish',$3,'conversation',0.90,$4)`,
      [id, userId, value, messageId],
    );
  }
});

