import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { IdentityError } from '../../identity/domain/identity-error';
import { CreateAiConversationUseCase } from '../application/create-ai-conversation.use-case';
import { GetQuickReplyPriceUseCase } from '../application/get-quick-reply-price.use-case';
import { StartQuickReplyUseCase } from '../application/start-quick-reply.use-case';
import {
  AiActionPriceResourceDto,
  AiConversationResourceDto,
  AiOperationResourceDto,
} from './ai-companion.dto';
import type { StartQuickReplyRequestDto } from './ai-companion.dto';

@ApiTags('ai-companion')
@ApiCookieAuth()
@Controller()
export class AiCompanionController {
  constructor(
    @Inject(GetQuickReplyPriceUseCase)
    private readonly getPrice: GetQuickReplyPriceUseCase,
    @Inject(CreateAiConversationUseCase)
    private readonly createConversation: CreateAiConversationUseCase,
    @Inject(StartQuickReplyUseCase)
    private readonly startQuickReply: StartQuickReplyUseCase,
  ) {}

  @Get('ai-action-prices/quick-reply')
  @ApiOkResponse({ type: AiActionPriceResourceDto })
  price(@Req() request: Request): Promise<AiActionPriceResourceDto> {
    return this.getPrice.execute(this.accessToken(request));
  }

  @Post('ai-conversations')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: AiConversationResourceDto })
  conversation(
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AiConversationResourceDto> {
    return this.createConversation.execute({
      accessToken: this.accessToken(request),
      idempotencyKey: requiredIdempotencyKey(idempotencyKey),
    });
  }

  @Post('ai/operations')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiAcceptedResponse({ type: AiOperationResourceDto })
  operation(
    @Body() body: StartQuickReplyRequestDto,
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AiOperationResourceDto> {
    return this.startQuickReply.execute({
      accessToken: this.accessToken(request),
      idempotencyKey: requiredIdempotencyKey(idempotencyKey),
      ...body,
    });
  }

  private accessToken(request: Request): string {
    return request.cookies?.atlas_access ?? '';
  }
}

function requiredIdempotencyKey(value: string | undefined): string {
  if (!value || !/^[!-~]{16,128}$/.test(value))
    throw new IdentityError(
      'IDEMPOTENCY_KEY_REQUIRED',
      400,
      'A valid Idempotency-Key header is required',
    );
  return value;
}
