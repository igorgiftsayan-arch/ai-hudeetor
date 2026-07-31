import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { CreateWeightEntryUseCase } from '../application/create-weight-entry.use-case';
import { ListWeightEntriesUseCase } from '../application/list-weight-entries.use-case';
import { GetCompanionWeightContextUseCase } from '../application/get-companion-weight-context.use-case';
import { TrackingController } from './tracking.controller';
@Module({})
export class TrackingModule {
  static forRoot(): DynamicModule {
    return {
      module: TrackingModule,
      controllers: [TrackingController],
      providers: [
        {
          provide: GetCompanionWeightContextUseCase,
          useFactory: (database: DatabaseService) =>
            new GetCompanionWeightContextUseCase(database),
          inject: [DatabaseService],
        },
        {
          provide: CreateWeightEntryUseCase,
          useFactory: (d: DatabaseService, c: GetCurrentUserUseCase) =>
            new CreateWeightEntryUseCase(d, c),
          inject: [DatabaseService, GetCurrentUserUseCase],
        },
        {
          provide: ListWeightEntriesUseCase,
          useFactory: (d: DatabaseService, c: GetCurrentUserUseCase) =>
            new ListWeightEntriesUseCase(d, c),
          inject: [DatabaseService, GetCurrentUserUseCase],
        },
      ],
      exports: [GetCompanionWeightContextUseCase],
    };
  }
}
