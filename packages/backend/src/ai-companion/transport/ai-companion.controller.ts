import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { IdentityError } from '../../identity/domain/identity-error';
import { CreateAiConversationUseCase } from '../application/create-ai-conversation.use-case';
import { GetQuickReplyPriceUseCase } from '../application/get-quick-reply-price.use-case';
import { GetAiOperationUseCase } from '../application/get-ai-operation.use-case';
import { GetAiConversationUseCase } from '../application/get-ai-conversation.use-case';
import { StartQuickReplyUseCase } from '../application/start-quick-reply.use-case';
import { ListAiMemoryUseCase } from '../application/list-ai-memory.use-case';
import { DeleteAiMemoryUseCase } from '../application/delete-ai-memory.use-case';
import { GetTodayAiDailyStateUseCase } from '../application/get-today-ai-daily-state.use-case';
import { TransitionAiDailyStateUseCase } from '../application/transition-ai-daily-state.use-case';
import {
  AiActionPriceResourceDto,
  AiConversationDetailResourceDto,
  AiConversationResourceDto,
  AiOperationResourceDto,
  AiMemoryListResourceDto,
  StartQuickReplyRequestDto,
  AiDailyStateResourceDto,
  AiDailyStateTransitionResourceDto,
  TransitionAiDailyStateRequestDto,
} from './ai-companion.dto';

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
    @Inject(GetAiOperationUseCase)
    private readonly getOperation: GetAiOperationUseCase,
    @Inject(GetAiConversationUseCase)
    private readonly getConversation: GetAiConversationUseCase,
    @Inject(ListAiMemoryUseCase)
    private readonly listMemory: ListAiMemoryUseCase,
    @Inject(DeleteAiMemoryUseCase)
    private readonly deleteMemory: DeleteAiMemoryUseCase,
    @Inject(GetTodayAiDailyStateUseCase)
    private readonly getTodayDailyState: GetTodayAiDailyStateUseCase,
    @Inject(TransitionAiDailyStateUseCase)
    private readonly transitionDailyState: TransitionAiDailyStateUseCase,
  ) {}

  @Get('ai-action-prices/quick-reply')
  @ApiOkResponse({ type: AiActionPriceResourceDto })
  price(@Req() request: Request): Promise<AiActionPriceResourceDto> {
    return this.getPrice.execute(this.accessToken(request));
  }

  @Get('ai-conversations/current')
  @ApiOkResponse({ type: AiConversationDetailResourceDto })
  currentConversation(
    @Req() request: Request,
  ): Promise<AiConversationDetailResourceDto> {
    return this.getConversation.execute({
      accessToken: this.accessToken(request),
    });
  }

  @Get('ai-conversations/:id')
  @ApiOkResponse({ type: AiConversationDetailResourceDto })
  conversationById(
    @Param('id') conversationId: string,
    @Req() request: Request,
  ): Promise<AiConversationDetailResourceDto> {
    return this.getConversation.execute({
      accessToken: this.accessToken(request),
      conversationId,
    });
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
  @ApiBody({ type: StartQuickReplyRequestDto })
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

  @Get('ai/operations/:id')
  @ApiOkResponse({ type: AiOperationResourceDto })
  getOperationById(
    @Param('id') operationId: string,
    @Req() request: Request,
  ): Promise<AiOperationResourceDto> {
    return this.getOperation.execute({
      accessToken: this.accessToken(request),
      operationId,
    });
  }

  @Get('ai-memory')
  @ApiOkResponse({ type: AiMemoryListResourceDto })
  memory(@Req() request: Request): Promise<AiMemoryListResourceDto> {
    return this.listMemory.execute(this.accessToken(request));
  }

  @Delete('ai-memory/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  deleteMemoryById(
    @Param('id') memoryId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.deleteMemory.execute({
      accessToken: this.accessToken(request),
      memoryId,
    });
  }

  @Get('ai-daily-states/today')
  @ApiOkResponse({ type: AiDailyStateResourceDto })
  todayDailyState(@Req() request: Request): Promise<AiDailyStateResourceDto> {
    return this.getTodayDailyState.execute(this.accessToken(request));
  }

  @Post('ai-daily-states/:id/transitions')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: TransitionAiDailyStateRequestDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AiDailyStateTransitionResourceDto })
  transitionDailyStateById(
    @Param('id', new ParseUUIDPipe()) stateId: string,
    @Body() body: TransitionAiDailyStateRequestDto,
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AiDailyStateTransitionResourceDto> {
    return this.transitionDailyState.execute({
      accessToken: this.accessToken(request),
      stateId,
      targetStatus: body.targetStatus,
      idempotencyKey: requiredIdempotencyKey(idempotencyKey),
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
