import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { IdentityError } from '../../identity/domain/identity-error';
import { CreateWeightEntryUseCase } from '../application/create-weight-entry.use-case';
import { ListWeightEntriesUseCase } from '../application/list-weight-entries.use-case';
import {
  CreateWeightEntryRequestDto,
  CreateWeightEntryResponseDto,
  WeightEntryPageDto,
} from './tracking.dto';

@ApiTags('tracking')
@ApiCookieAuth()
@Controller('weight-entries')
export class TrackingController {
  constructor(
    @Inject(CreateWeightEntryUseCase)
    private readonly create: CreateWeightEntryUseCase,
    @Inject(ListWeightEntriesUseCase)
    private readonly list: ListWeightEntriesUseCase,
  ) {}

  @Post()
  @ApiBody({ type: CreateWeightEntryRequestDto })
  @ApiCreatedResponse({ type: CreateWeightEntryResponseDto })
  createEntry(
    @Body() body: CreateWeightEntryRequestDto,
    @Req() req: Request,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!key || key.length < 16)
      throw new IdentityError(
        'IDEMPOTENCY_KEY_REQUIRED',
        400,
        'An idempotency key is required',
      );
    return this.create.execute({
      accessToken: req.cookies?.atlas_access ?? '',
      idempotencyKey: key,
      ...body,
    });
  }

  @Get()
  @ApiOkResponse({ type: WeightEntryPageDto })
  entries(@Req() req: Request) {
    return this.list.execute(req.cookies?.atlas_access ?? '');
  }
}
