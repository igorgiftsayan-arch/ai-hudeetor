import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { RedisService } from './redis/redis.service';

export interface TechnicalInfrastructureOptions {
  databaseUrl: string;
  redisUrl: string;
}

@Module({})
export class TechnicalInfrastructureModule {
  static forRoot(options: TechnicalInfrastructureOptions): DynamicModule {
    return {
      module: TechnicalInfrastructureModule,
      providers: [
        {
          provide: DatabaseService,
          useFactory: () => new DatabaseService(options.databaseUrl),
        },
        {
          provide: RedisService,
          useFactory: () => new RedisService(options.redisUrl),
        },
      ],
      exports: [DatabaseService, RedisService],
    };
  }
}
