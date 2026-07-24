import { GetAiConversationUseCase } from '@atlas/backend';

describe('GetAiConversationUseCase', () => {
  it('loads the current persisted conversation for the authenticated owner', async () => {
    const currentUser = {
      execute: jest.fn().mockResolvedValue({ userId: 'owner-1' }),
    };
    const repository = {
      getCurrentConversation: jest.fn().mockResolvedValue({
        id: 'conversation-1',
        messages: [],
      }),
    };
    const useCase = new GetAiConversationUseCase(
      currentUser as never,
      repository as never,
    );

    await expect(
      useCase.execute({ accessToken: 'opaque-token' }),
    ).resolves.toMatchObject({ id: 'conversation-1', messages: [] });
    expect(repository.getCurrentConversation).toHaveBeenCalledWith('owner-1');
  });

  it('loads a requested conversation only through the authenticated owner', async () => {
    const currentUser = {
      execute: jest.fn().mockResolvedValue({ userId: 'owner-1' }),
    };
    const repository = {
      getConversation: jest.fn().mockResolvedValue({
        id: 'conversation-2',
        messages: [],
      }),
    };
    const useCase = new GetAiConversationUseCase(
      currentUser as never,
      repository as never,
    );

    await useCase.execute({
      accessToken: 'opaque-token',
      conversationId: 'conversation-2',
    });

    expect(repository.getConversation).toHaveBeenCalledWith(
      'owner-1',
      'conversation-2',
    );
  });
});
