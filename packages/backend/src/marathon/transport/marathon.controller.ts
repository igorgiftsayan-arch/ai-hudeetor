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
// The constructor value is required by Nest's emitted design:paramtypes metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MarathonService } from '../application/marathon.service';
// DTO values are required by Nest's emitted request metadata and OpenAPI decorators.
/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  CaptainTaskDto,
  CaptainTaskResponseDto,
  CreateMarathonDto,
  CurrentMarathonDto,
  EmptyMarathonCommandDto,
  JoinMarathonDto,
  MarathonEnrollmentClosedDto,
  MarathonEnrollmentCreatedDto,
  MarathonLobbyDto,
  MarathonMembershipCreatedDto,
  MarathonStartedDto,
  OpenMarathonEnrollmentDto,
  TaskCompletionDto,
  TaskCompletionResponseDto,
  TeamTodayDto,
  WellnessReportDto,
  WellnessReportReadDto,
  WellnessReportSavedDto,
} from './marathon.dto';
/* eslint-enable @typescript-eslint/consistent-type-imports */
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
  @Get('marathons/lobby')
  @ApiOkResponse({ type: MarathonLobbyDto })
  lobby(@Req() r: Request) {
    return this.service.lobby(r.cookies?.atlas_access ?? '');
  }
  @Post('marathons/enrollment')
  @ApiCreatedResponse({ type: MarathonEnrollmentCreatedDto })
  openEnrollment(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Body() body: OpenMarathonEnrollmentDto,
  ) {
    return this.service.openEnrollment(
      r.cookies?.atlas_access ?? '',
      key(k),
      body,
    );
  }
  @Post('marathons/:id/memberships')
  @ApiCreatedResponse({ type: MarathonMembershipCreatedDto })
  joinEnrollment(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Param('id') id: string,
    @Body() _body: EmptyMarathonCommandDto,
  ) {
    void _body;
    return this.service.joinEnrollment(
      r.cookies?.atlas_access ?? '',
      id,
      key(k),
    );
  }
  @Post('marathons/:id/enrollment-close')
  @ApiOkResponse({ type: MarathonEnrollmentClosedDto })
  closeEnrollment(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Param('id') id: string,
    @Body() _body: EmptyMarathonCommandDto,
  ) {
    void _body;
    return this.service.closeEnrollment(
      r.cookies?.atlas_access ?? '',
      id,
      key(k),
    );
  }
  @Post('marathons/:id/start')
  @ApiOkResponse({ type: MarathonStartedDto })
  start(
    @Req() r: Request,
    @Headers('idempotency-key') k: string | undefined,
    @Param('id') id: string,
    @Body() _body: EmptyMarathonCommandDto,
  ) {
    void _body;
    return this.service.startMarathon(
      r.cookies?.atlas_access ?? '',
      id,
      key(k),
    );
  }
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
}
