import 'reflect-metadata';
import { createServer } from 'node:http';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseService, RedisService } from '@atlas/backend';
import { loadWorkerConfig } from './config/load-config';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const config = loadWorkerConfig();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  app.enableShutdownHooks();
  const database = app.get(DatabaseService);
  const redis = app.get(RedisService);

  const healthServer = createServer(async (request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ service: 'worker', status: 'ok' }));
      return;
    }
    if (request.url === '/health/ready') {
      try {
        await Promise.all([database.check(), redis.check()]);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ service: 'worker', status: 'ok' }));
      } catch {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ service: 'worker', status: 'not_ready' }),
        );
      }
      return;
    }
    response.writeHead(404).end();
  });

  healthServer.listen(config.WORKER_HEALTH_PORT, '0.0.0.0');
}

void bootstrap();
