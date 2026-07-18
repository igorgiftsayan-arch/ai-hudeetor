import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import {
  TechnicalInfrastructureModule,
  workerConfigSchema,
} from '@atlas/backend';
import { loadWorkerConfig } from './config/load-config';

const configModule = ConfigModule.forRoot({
  envFilePath: ['../../.env.local', '../../.env', '.env.local', '.env'],
  isGlobal: true,
  validate: (environment: Record<string, unknown>) =>
    workerConfigSchema.parse(environment),
});
const config = loadWorkerConfig();
const redisUrl = new URL(config.REDIS_URL);

@Module({
  imports: [
    configModule,
    TechnicalInfrastructureModule.forRoot({
      databaseUrl: config.DATABASE_URL,
      redisUrl: config.REDIS_URL,
    }),
    BullModule.forRoot({
      connection: {
        db: Number(redisUrl.pathname.slice(1) || 0),
        host: redisUrl.hostname,
        password: redisUrl.password || undefined,
        port: Number(redisUrl.port || 6379),
      },
    }),
    BullModule.registerQueue({ name: config.WORKER_QUEUE_NAME }),
  ],
})
export class WorkerModule {}
