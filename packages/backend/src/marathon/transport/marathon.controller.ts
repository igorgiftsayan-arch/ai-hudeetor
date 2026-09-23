import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { IdentityError } from '../../identity/domain/identity-error';
import { MarathonService } from '../application/marathon.service';
import {
  CaptainTaskDto,
  CaptainTaskResponseDto,
  CreateMarathonDto,
  CurrentMarathonDto,
  JoinMarathonDto,
  ProviderConsentDto,
  ProviderConsentMetadataDto,
  TaskCompletionDto,
  TaskCompletionResponseDto,
  TeamTodayDto,
  WellnessReportDto,
  WellnessReportReadDto,
  WellnessReportSavedDto,
} from './marathon.dto';
function key(value?: string) {
  if (!value || value.length < 16)
    throw new IdentityError(
      'IDEMPOTENCY_KEY_REQUIRED',
      400,
      'An idempotency key is required',
    );
  return value;
}
@ApiTags('marathon')
@ApiCookieAuth()
@Controller()
export class MarathonController {
  constructor(private readonly service: MarathonService) {}
  @Post('marathons') @ApiCreatedResponse() create(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Body() b: CreateMarathonDto,
  ) {
    return this.service.createMarathon(
      r.cookies?.atlas_access ?? '',
      key(k),
      b,
    );
  }
  @Post('marathon-team-memberships') @ApiCreatedResponse() join(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Body() b: JoinMarathonDto,
  ) {
    return this.service.join(r.cookies?.atlas_access ?? '', key(k), b.joinCode);
  }
  @Get('marathons/current')
  @ApiOkResponse({ type: CurrentMarathonDto })
  current(@Req() r: Request) {
    return this.service.current(r.cookies?.atlas_access ?? '');
  }
  @Get('marathon-wellness-reports/:reportDate')
  @ApiOkResponse({ type: WellnessReportReadDto })
  report(@Req() r: Request, @Param('reportDate') d: string) {
    return this.service.getReport(r.cookies?.atlas_access ?? '', d);
  }
  @Put('marathon-wellness-reports/:reportDate')
  @ApiOkResponse({ type: WellnessReportSavedDto })
  saveReport(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Param('reportDate') d: string,
    @Body() b: WellnessReportDto,
  ) {
    return this.service.saveReport(r.cookies?.atlas_access ?? '', key(k), d, b);
  }
  @Put('marathon-captain-tasks/:taskDate')
  @ApiOkResponse({ type: CaptainTaskResponseDto })
  task(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Param('taskDate') d: string,
    @Body() b: CaptainTaskDto,
  ) {
    return this.service.saveTask(r.cookies?.atlas_access ?? '', key(k), d, b);
  }
  @Put('marathon-captain-tasks/:taskId/completion')
  @ApiOkResponse({ type: TaskCompletionResponseDto })
  completion(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Param('taskId') id: string,
    @Body() b: TaskCompletionDto,
  ) {
    return this.service.completeTask(
      r.cookies?.atlas_access ?? '',
      key(k),
      id,
      b.completed,
    );
  }
  @Get('marathon-teams/current/today')
  @ApiOkResponse({ type: TeamTodayDto })
  today(@Req() r: Request) {
    return this.service.today(r.cookies?.atlas_access ?? '');
  }
  @Get('users/me/ai-provider-consent')
  @ApiOkResponse({ type: ProviderConsentMetadataDto })
  consent(@Req() r: Request) {
    return this.service.consentMetadata(r.cookies?.atlas_access ?? '');
  }
  @Put('users/me/ai-provider-consent')
  @ApiOkResponse({ type: ProviderConsentMetadataDto })
  accept(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Body() b: ProviderConsentDto,
  ) {
    key(k);
    return this.service.acceptConsent(r.cookies?.atlas_access ?? '', b);
  }
}
