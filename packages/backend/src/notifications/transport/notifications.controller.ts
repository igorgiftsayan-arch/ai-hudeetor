import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PushNotificationsService } from '../application/push-notifications.service';
// Request DTO values are required by Nest's emitted design:paramtypes metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RevokePushSubscriptionDto, SavePushPreferenceDto, SavePushSubscriptionDto } from './notifications.dto';
import { PushPreferenceResourceDto, PushSubscriptionResourceDto } from './notifications.dto';

@ApiTags('notifications')
@ApiCookieAuth()
@Controller('notification-preferences/push')
export class NotificationsController {
  constructor(@Inject(PushNotificationsService) private readonly push: PushNotificationsService) {}
  @Get() @ApiOkResponse({type:PushPreferenceResourceDto}) get(@Req() req:Request){ return this.push.get(token(req)); }
  @Put() @ApiOkResponse({type:PushPreferenceResourceDto}) save(@Body() body:SavePushPreferenceDto,@Req() req:Request){ return this.push.savePreference(token(req),body); }
  @Post('subscriptions') @ApiCreatedResponse({type:PushSubscriptionResourceDto}) subscribe(@Body() body:SavePushSubscriptionDto,@Req() req:Request){ return this.push.subscribe(token(req),body); }
  @Post('subscription-revocations') @HttpCode(204) @ApiNoContentResponse() unsubscribeByEndpoint(@Body() body:RevokePushSubscriptionDto,@Req() req:Request){ return this.push.unsubscribeByEndpoint(token(req),body.endpoint); }
  @Delete('subscriptions/:id') @HttpCode(204) @ApiNoContentResponse() unsubscribe(@Param('id') id:string,@Req() req:Request){ return this.push.unsubscribe(token(req),id); }
}
function token(req:Request){ return req.cookies?.atlas_access ?? ''; }
