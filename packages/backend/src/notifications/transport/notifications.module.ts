import { Module } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { PushNotificationsService } from '../application/push-notifications.service';
import { NotificationsController } from './notifications.controller';
@Module({controllers:[NotificationsController],providers:[{provide:PushNotificationsService,useFactory:(db:DatabaseService,current:GetCurrentUserUseCase)=>new PushNotificationsService(db,current),inject:[DatabaseService,GetCurrentUserUseCase]}]})
export class NotificationsModule {}
