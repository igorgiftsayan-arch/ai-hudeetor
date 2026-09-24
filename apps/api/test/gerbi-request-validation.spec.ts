import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FoodController } from '../../../packages/backend/src/food/transport/food.controller';
import { FoodService } from '../../../packages/backend/src/food/application/food.service';
import { NotificationsController } from '../../../packages/backend/src/notifications/transport/notifications.controller';
import { PushNotificationsService } from '../../../packages/backend/src/notifications/application/push-notifications.service';

describe('GERBI request DTO validation', () => {
  it('rejects an invalid push schedule before the service is called', async () => {
    const push = { savePreference: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: PushNotificationsService, useValue: push }],
    }).compile();
    const app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1', prefix: 'api/v' });
    app.useGlobalPipes(new ValidationPipe({ errorHttpStatusCode: 422, whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    await request(app.getHttpServer())
      .put('/api/v1/notification-preferences/push')
      .send({ enabled: true, localTime: '28:90', timezone: 'Europe/Moscow' })
      .expect(422);
    expect(push.savePreference).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an oversized correction before the service is called', async () => {
    const food = { correct: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [FoodController],
      providers: [{ provide: FoodService, useValue: food }],
    }).compile();
    const app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1', prefix: 'api/v' });
    app.useGlobalPipes(new ValidationPipe({ errorHttpStatusCode: 422, whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    await request(app.getHttpServer())
      .patch('/api/v1/food-analyses/analysis-1/correction')
      .send({ items: Array.from({ length: 26 }, (_, index) => ({ name: `item-${index}` })) })
      .expect(422);
    expect(food.correct).not.toHaveBeenCalled();
    await app.close();
  });
});
