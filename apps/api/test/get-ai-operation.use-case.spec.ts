import { GetAiOperationUseCase } from '@atlas/backend';

describe('GetAiOperationUseCase', () => {
  it('uses the authenticated owner when loading an operation for polling', async () => {
    const currentUser = { execute: jest.fn().mockResolvedValue({ userId: 'owner-1' }) };
    const repository = {
      getOperation: jest.fn().mockResolvedValue({ id: 'operation-1', status: 'succeeded' }),
    };
    const useCase = new GetAiOperationUseCase(currentUser as never, repository as never);

    await expect(useCase.execute({ accessToken: 'opaque-token', operationId: 'operation-1' }))
      .resolves.toMatchObject({ id: 'operation-1', status: 'succeeded' });
    expect(repository.getOperation).toHaveBeenCalledWith('owner-1', 'operation-1');
  });
});
