import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { MarathonService } from '../application/marathon.service';
import { MarathonController } from './marathon.controller';
export type MarathonOptions = {
  bootstrapEnabled: boolean;
  bootstrapUserIds: string[];
  providerMode: 'fake' | 'genapi';
  consentVersion: string;
  consentDisclosure: string;
};
@Module({})
export class MarathonModule {
  static forRoot(o: MarathonOptions): DynamicModule {
    return {
      module: MarathonModule,
      controllers: [MarathonController],
      providers: [
        {
          provide: MarathonService,
          useFactory: (d: DatabaseService, u: GetCurrentUserUseCase) =>
            new MarathonService(d, u, {
              ...o,
              bootstrapUserIds: new Set(o.bootstrapUserIds),
            }),
          inject: [DatabaseService, GetCurrentUserUseCase],
        },
      ],
    };
  }
}
