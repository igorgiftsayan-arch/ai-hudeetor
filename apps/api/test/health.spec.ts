import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';

describe('API health', () => {
  it('returns service readiness and a request id', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();

    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      service: 'api',
      status: expect.any(String),
    });
    await app.close();
  });

  it('uses the project error envelope', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();

    const response = await request(app.getHttpServer()).get(
      '/api/v1/not-found',
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'not_found',
        message: 'Resource not found',
        details: {},
        request_id: expect.any(String),
      },
    });
    await app.close();
  });
});
