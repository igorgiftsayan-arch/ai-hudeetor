import { FoodService } from '../../../packages/backend/src/food/application/food.service';

describe('Food upload signature contract', () => {
  const checksum = 'a'.repeat(64);
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const service = new FoodService(
    { query } as never,
    { execute: async () => ({ userId: 'synthetic-owner' }) } as never,
    {
      enabled: true, endpoint: 'http://private-storage:9000',
      publicEndpoint: 'http://localhost:13114', region: 'us-east-1',
      bucket: 'atlas-private', accessKeyId: 'synthetic-access',
      secretAccessKey: 'synthetic-secret', forcePathStyle: true,
      runtimeAdapter: 'fake', consentVersion: 'test-v1',
    },
  );

  it.each([2_653_194, 10_485_760])('signs the browser metadata header for %i bytes', async (sizeBytes) => {
    const intent = await service.createUploadIntent('synthetic-session', {
      contentType: 'image/png', sizeBytes, sha256: checksum,
    });
    const url = new URL(intent.uploadUrl);
    expect(url.origin).toBe('http://localhost:13114');
    expect(intent.requiredHeaders).toEqual({
      'content-type': 'image/png', 'x-amz-meta-sha256': checksum,
    });
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining(['host', 'content-length', 'x-amz-meta-sha256']),
    );
    expect(url.searchParams.has('x-amz-meta-sha256')).toBe(false);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
  });

  it('keeps the 10 MiB upload limit before any database insert', async () => {
    query.mockClear();
    await expect(service.createUploadIntent('synthetic-session', {
      contentType: 'image/png', sizeBytes: 10_485_761, sha256: checksum,
    })).rejects.toMatchObject({ code: 'FOOD_IMAGE_INVALID' });
    expect(query).not.toHaveBeenCalled();
  });
});
