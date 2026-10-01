import {FoodImageRetentionRunner} from '../src/food-image-retention.runner';

describe('Food retention worker lifecycle',()=>{
 beforeEach(()=>jest.useFakeTimers());
 afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});
 it('does not run without configured storage',()=>{
  const retention={enqueueDue:jest.fn(),processOne:jest.fn()};
  new FoodImageRetentionRunner(retention as never,false).onModuleInit();
  expect(retention.enqueueDue).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);
 });
 it('contains dependency errors and resumes the durable queue on the next tick',async()=>{
  const log=jest.spyOn(console,'error').mockImplementation(()=>undefined);
  const retention={enqueueDue:jest.fn().mockRejectedValueOnce(new Error('synthetic private storage URL')).mockResolvedValue({enqueued:1,skippedUnknownTerminalTime:0}),processOne:jest.fn().mockResolvedValue(false)};
  const runner=new FoodImageRetentionRunner(retention as never,true);runner.onModuleInit();
  await jest.advanceTimersByTimeAsync(0);
  expect(log).toHaveBeenCalledWith(JSON.stringify({event:'food_image_retention_error',errorCategory:'dependencyUnavailable'}));
  await jest.advanceTimersByTimeAsync(60000);
  expect(retention.processOne).toHaveBeenCalledTimes(1);
  await runner.onModuleDestroy();expect(jest.getTimerCount()).toBe(0);
 });
 it('does not overlap cleanup and drains it before database shutdown',async()=>{
  let release!:(value:{enqueued:number;skippedUnknownTerminalTime:number})=>void;
  const retention={enqueueDue:jest.fn().mockImplementation(()=>new Promise(resolve=>{release=resolve;})),processOne:jest.fn()};
  const runner=new FoodImageRetentionRunner(retention as never,true);runner.onModuleInit();
  await jest.advanceTimersByTimeAsync(120000);expect(retention.enqueueDue).toHaveBeenCalledTimes(1);
  let stopped=false;const stop=runner.onModuleDestroy().then(()=>{stopped=true;});
  await jest.advanceTimersByTimeAsync(0);expect(stopped).toBe(false);
  release({enqueued:0,skippedUnknownTerminalTime:0});await stop;
  expect(retention.processOne).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);
 });
});
