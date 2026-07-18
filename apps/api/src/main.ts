import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap/configure-application';
import { loadApiConfig } from './config/load-config';

async function bootstrap(): Promise<void> {
  const config = loadApiConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApplication(app);
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, config.API_HOST);
}

void bootstrap();
