import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MarathonController } from '../../../packages/backend/src/marathon/transport/marathon.controller';
import { MarathonService } from '../../../packages/backend/src/marathon/application/marathon.service';

describe('Marathon enrollment HTTP response contract', () => {
  it.each([
    ['enrollment-close', 'closeEnrollment', 'enrollmentClosed'],
    ['start', 'startMarathon', 'inProgress'],
  ])('returns the documented 200 for %s', async (route, method, status) => {
    const id = '7688a828-52c3-4bbb-af5d-b69500a0e207';
    const result = { marathonId: id, status };
    const service = { [method]: jest.fn().mockResolvedValue(result) };
    const module = await Test.createTestingModule({
      controllers: [MarathonController],
      providers: [{ provide: MarathonService, useValue: service }],
    }).compile();
    const app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1', prefix: 'api/v' });
    await app.init();
    try {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/marathons/${id}/${route}`)
        .set('Idempotency-Key', 'marathon-http-contract-test')
        .send({});
      expect(response.status).toBe(200);
      expect(response.body).toEqual(result);
      expect(service[method]).toHaveBeenCalledWith('', id, 'marathon-http-contract-test');
    } finally {
      await app.close();
    }
  });
});
