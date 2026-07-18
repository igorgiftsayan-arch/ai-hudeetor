import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DatabaseService as DatabaseServiceToken,
  RedisService as RedisServiceToken,
} from '@atlas/backend';
import type { DatabaseService, RedisService } from '@atlas/backend';

interface HealthResponse {
  service: 'api';
  status: 'ok' | 'not_ready';
  checks?: { postgres: 'ok'; redis: 'ok' };
}

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseServiceToken)
    private readonly database: DatabaseService,
    @Inject(RedisServiceToken)
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'API liveness' })
  liveness(): HealthResponse {
    return { service: 'api', status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'API dependency readiness' })
  async readiness(): Promise<HealthResponse> {
    try {
      await Promise.all([this.database.check(), this.redis.check()]);
      return {
        service: 'api',
        status: 'ok',
        checks: { postgres: 'ok', redis: 'ok' },
      };
    } catch {
      throw new ServiceUnavailableException(
        'Service dependencies are not ready',
      );
    }
  }
}
