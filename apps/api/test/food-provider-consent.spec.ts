import { MarathonService } from '@atlas/backend';

describe('Feature-specific external provider consent metadata', () => {
  it.each([
    ['fake', 'genapi', false, true],
    ['genapi', 'fake', true, false],
    ['fake', 'fake', false, false],
  ] as const)(
    'keeps chat %s and food %s consent capabilities separate',
    async (providerMode, foodProviderMode, chatExternal, foodExternal) => {
      const options = {
        bootstrapEnabled: false,
        bootstrapUserIds: new Set<string>(),
        providerMode,
        foodProviderMode,
        consentVersion: 'v1',
        consentDisclosure: 'External processing notice',
      };
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const service = new MarathonService(
        { query } as never,
        { execute: async () => ({ userId: 'owner' }) } as never,
        options,
      );
      expect(await service.consentMetadata('token')).toMatchObject({
        providerMode,
        externalProviderEnabled: chatExternal,
        foodProviderMode,
        foodExternalProviderEnabled: foodExternal,
        accepted: false,
      });
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('document_version=$2'),
        ['owner', 'v1'],
      );
    },
  );
});
