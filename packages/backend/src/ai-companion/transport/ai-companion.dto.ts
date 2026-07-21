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

export class AiOperationResourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['queued'] }) status!: 'queued';
  @ApiProperty({ format: 'uuid' }) conversationId!: string;
  @ApiProperty({ format: 'uuid' }) inputMessageId!: string;
  @ApiProperty() reservedTokens!: number;
  @ApiProperty() priceVersion!: number;
  @ApiProperty() pollUrl!: string;
  @ApiProperty({ enum: ['fake'] }) runtimeAdapter!: 'fake';
}
