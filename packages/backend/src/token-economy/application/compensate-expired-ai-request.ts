import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../infrastructure/database/database.service';

export type AiRecoveryTarget = 'chat' | 'food';
const targets = {
  chat: { table: 'ai_operations', column: 'operation_id', receipt: 'ai_operation_request_receipts', error: 'error_class', reference: 'aiOperation' },
  food: { table: 'food_analyses', column: 'food_analysis_id', receipt: 'food_analysis_request_receipts', error: 'error_category', reference: 'foodAnalysis' },
} as const;

// Must run in the caller's transaction: all submit/finalize/refund writers take
// the same operation lock before the reservation lock. Provider billing is unknown.
export async function compensateExpiredAiRequest(client: PoolClient, target: AiRecoveryTarget, id: string): Promise<boolean> {
  const t = targets[target];
  const row = (await client.query<{user_id:string;created_at:Date;status:string}>(
    `select user_id,created_at,status from ${t.table} where id=$1 for update`, [id],
  )).rows[0];
  if (!row || !['queued','processing','outcomeUnknown'].includes(row.status)) return false;
  // now() is transaction-start time and would be stale after waiting on a lock.
  const due = (await client.query<{due:boolean}>("select $1::timestamptz + interval '300 seconds' <= clock_timestamp() due", [row.created_at])).rows[0]?.due;
  if (!due) return false;
  const reservation = (await client.query<{id:string;wallet_id:string;amount_tokens:number}>(
    `select id,wallet_id,amount_tokens from token_transactions where ${t.column}=$1 and entry_type='aiReservation' for update`, [id],
  )).rows[0];
  if (!reservation) throw new Error('AI reservation invariant failed');
  const terminal = await client.query("select 1 from token_transactions where reservation_id=$1 and entry_type in ('aiConfirmation','aiRefund')", [reservation.id]);
  if (terminal.rowCount) throw new Error('AI terminal ledger invariant failed');
  const refund = randomUUID();
  await client.query(`insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,${t.column},reservation_id) values($1,$2,$3,'aiRefund',$4,$5,$6,$6,$7)`, [refund,reservation.wallet_id,row.user_id,-reservation.amount_tokens,t.reference,id,reservation.id]);
  await client.query(`insert into ai_recovery_compensations(${t.column},reservation_id,refund_id,reason,deadline_at) values($1,$2,$3,'projectExpenseRecoveryDeadline',$4::timestamptz+interval '300 seconds')`, [id,reservation.id,refund,row.created_at]);
  await client.query(`update ${t.table} set status='technicalError',${t.error}='recoveryDeadlineExceeded',updated_at=clock_timestamp() where id=$1`, [id]);
  // Completed means local processing ended; provider ID/hash/payload stay intact.
  await client.query(`update ${t.receipt} set submission_state='completed',updated_at=clock_timestamp() where ${target==='chat'?'operation_id':'food_analysis_id'}=$1`, [id]);
  return true;
}

export class AiRecoveryDeadlineService {
  constructor(private readonly database: DatabaseService) {}
  async sweep(): Promise<void> {
    for (const target of ['chat','food'] as const) {
      const t=targets[target];
      const due=await this.database.query<{id:string}>(`select id from ${t.table} where status in ('queued','processing','outcomeUnknown') and created_at + interval '300 seconds' <= clock_timestamp() order by created_at,id limit 50`);
      for(const row of due.rows) await this.database.transaction(client=>compensateExpiredAiRequest(client,target,row.id));
    }
  }
}
