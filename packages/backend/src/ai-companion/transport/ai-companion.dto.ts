import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, IsUUID, Min } from 'class-validator';

export class StartQuickReplyRequestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() conversationId!: string;
  @ApiProperty({ minLength: 1, maxLength: 4000 }) @IsString() content!: string;
  @ApiProperty({ enum: ['quickReply'] })
  @IsIn(['quickReply'])
  scenarioId!: 'quickReply';
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) expectedPriceTokens!: number;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) priceVersion!: number;
}

export class AiActionPriceResourceDto {
  @ApiProperty({ enum: ['quickReply'] }) actionType!: 'quickReply';
  @ApiProperty({ example: 1 }) priceTokens!: number;
  @ApiProperty({ example: 1 }) priceVersion!: number;
}

export class AiConversationResourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class AiConversationMessageResourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';
  @ApiProperty() content!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AiConversationDetailResourceDto extends AiConversationResourceDto {
  @ApiProperty({ type: () => [AiConversationMessageResourceDto] })
  messages!: AiConversationMessageResourceDto[];
}

export class AiOperationResourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: [
      'queued',
      'processing',
      'succeeded',
      'technicalError',
      'outcomeUnknown',
    ],
  })
  status!:
    'queued' | 'processing' | 'succeeded' | 'technicalError' | 'outcomeUnknown';
  @ApiProperty({ format: 'uuid' }) conversationId!: string;
  @ApiProperty({ format: 'uuid' }) inputMessageId!: string;
  @ApiProperty() reservedTokens!: number;
  @ApiProperty() priceVersion!: number;
  @ApiProperty() pollUrl!: string;
  @ApiProperty({ enum: ['fake', 'genapi'] })
  runtimeAdapter!: 'fake' | 'genapi';
  @ApiProperty({ format: 'uuid', required: false }) outputMessageId?: string;
  @ApiProperty({ required: false }) responseText?: string;
  @ApiProperty({ required: false }) errorCode?: string;
}
