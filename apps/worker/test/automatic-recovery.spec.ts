import { AutomaticRecoveryService } from '../src/automatic-recovery.service';

describe('AutomaticRecoveryService',()=>{
  it('moves accepted crash-boundary operations to reconciliation without refund or resubmit',async()=>{
    const client={query:jest.fn(async(statement:string)=>{
      if(statement.includes("from food_analyses where status='processing'"))return{rows:[{id:'food-1'}]};
      if(statement.includes('from food_analysis_request_receipts where food_analysis_id'))return{rows:[{submission_state:'accepted',provider_request_id:'food-provider-1'}]};
      if(statement.includes("from ai_operations where status='processing'"))return{rows:[{id:'ai-1'}]};
      if(statement.includes('from ai_operation_request_receipts where operation_id'))return{rows:[{submission_state:'accepted',provider_request_id:'ai-provider-1'}]};
      return{rows:[]};
    })};
    const database={query:client.query,transaction:jest.fn(async(callback:(value:typeof client)=>unknown)=>callback(client))};
    const service=new AutomaticRecoveryService(database as never);

    await service.sweep();

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("food.analysis_reconciliation_requested.v1"),['food-1']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("ai-companion.operation_reconciliation_requested.v1"),['ai-1']);
    const sql=client.query.mock.calls.map(([statement])=>String(statement)).join('\n');
    expect(sql).not.toContain("'aiRefund'");
  });
});
