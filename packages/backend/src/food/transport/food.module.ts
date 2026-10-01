import type { DynamicModule} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { FoodService } from '../application/food.service';
import { FoodController } from './food.controller';

@Module({})
export class FoodModule {
  static forRoot(config: ConstructorParameters<typeof FoodService>[2]): DynamicModule {
    return {
      module: FoodModule,
      controllers: [FoodController],
      providers: [{ provide: FoodService, useFactory: (db: DatabaseService, current: GetCurrentUserUseCase) => new FoodService(db, current, config), inject: [DatabaseService, GetCurrentUserUseCase] }],
    };
  }
}
