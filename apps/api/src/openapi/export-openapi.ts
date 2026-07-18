import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApplication } from '../bootstrap/configure-application';
import { createOpenApiDocument } from './create-openapi-document';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApplication(app);
  await app.init();
  const target = resolve(
    process.cwd(),
    '../../packages/api-contracts/openapi.json',
  );
  await writeFile(
    target,
    `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`,
    'utf8',
  );
  await app.close();
}

void exportOpenApi();
