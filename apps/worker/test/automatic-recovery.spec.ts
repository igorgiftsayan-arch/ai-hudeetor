import { AutomaticRecoveryService } from '../src/automatic-recovery.service';

describe('AutomaticRecoveryService',()=>{
  it('moves accepted crash-boundary operations to reconciliation without refund or resubmit',async()=>{
    const client={query:jest.fn()
      .mockResolvedValueOnce({rows:[{id:'food-1'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{id:'ai-1'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})};
    const database={transaction:jest.fn(async(callback:(value:typeof client)=>unknown)=>callback(client))};
    const service=new AutomaticRecoveryService(database as never);

    await service.sweep();

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("food.analysis_reconciliation_requested.v1"),['food-1']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("ai-companion.operation_reconciliation_requested.v1"),['ai-1']);
    const sql=client.query.mock.calls.map(([statement])=>String(statement)).join('\n');
    expect(sql).not.toContain("'aiRefund'");
    expect(sql).not.toContain('analysis_requested.v1\'');
  });
});
