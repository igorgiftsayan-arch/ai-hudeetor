import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateFoodUploadIntentDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsString()
  contentType!: string;

  @ApiProperty({ minimum: 1, maximum: 10_485_760 })
  @IsInt()
  @Min(1)
  @Max(10_485_760)
  sizeBytes!: number;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  sha256!: string;
}

export class FoodUploadIntentResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['pendingUpload'] }) status!: 'pendingUpload';
  @ApiProperty() uploadUrl!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ type: Object }) requiredHeaders!: Record<string, string>;
}

export class FoodUploadCompletionResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['available'] }) status!: 'available';
}

export class FoodActionPriceDto {
  @ApiProperty({ enum: ['foodPhotoAnalysis'] }) actionType!: 'foodPhotoAnalysis';
  @ApiProperty() tokenPrice!: number;
  @ApiProperty() priceVersion!: number;
}

export class CreateFoodAnalysisDto {
  @ApiProperty() @IsString() uploadedImageId!: string;
  @ApiProperty() @IsInt() @Min(1) expectedTokenPrice!: number;
  @ApiProperty() @IsInt() @Min(1) expectedPriceVersion!: number;
}

export class QueuedFoodAnalysisResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['queued'] }) status!: 'queued';
  @ApiProperty() reservedTokens!: number;
  @ApiProperty() priceVersion!: number;
  @ApiProperty() pollingUrl!: string;
}

export class FoodComponentDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional({ maximum: 1, minimum: 0 }) @IsOptional() confidence?: number;
}

export class FoodRecognizedResultDto {
  @ApiProperty({ enum: ['food','nonFood','ambiguous'] }) kind!: 'food'|'nonFood'|'ambiguous';
  @ApiPropertyOptional({ type: String, nullable: true }) dishName!: string | null;
  @ApiProperty({ type: [FoodComponentDto] }) items!: FoodComponentDto[];
  @ApiProperty({ type: [String] }) uncertaintyNotes!: string[];
}

export class FoodSuitabilityResultDto {
  @ApiProperty({ enum: ['matches','doesNotMatch','mixed','insufficientData'] }) status!: string;
  @ApiProperty({ enum: ['profile','gerbiProgram','none'] }) source!: string;
  @ApiProperty({ type: [String] }) observations!: string[];
  @ApiProperty({ type: [String] }) missingData!: string[];
}

export class FoodCorrectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) dishName?: string;
  @ApiProperty({ type: [FoodComponentDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => FoodComponentDto) items!: FoodComponentDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ConfirmFoodConsumptionDto {
  @ApiProperty() @IsISO8601() consumedAt!: string;
  @ApiProperty() @IsString() @MaxLength(64) timezone!: string;
}

export class UpdateFoodConsumptionDto extends ConfirmFoodConsumptionDto {
  @ApiProperty({ type: FoodCorrectionDto }) @ValidateNested() @Type(() => FoodCorrectionDto) confirmedResult!: FoodCorrectionDto;
}

export class FoodAnalysisResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() uploadedImageId!: string;
  @ApiProperty({ enum: ['queued','processing','analyzed','technicalError','outcomeUnknown','deleted'] })
  status!: string;
  @ApiProperty() runtimeAdapter!: string;
  @ApiPropertyOptional({ type: FoodRecognizedResultDto }) recognizedResult!: FoodRecognizedResultDto | null;
  @ApiPropertyOptional({ type: FoodSuitabilityResultDto }) suitabilityResult!: FoodSuitabilityResultDto | null;
  @ApiPropertyOptional({ type: FoodCorrectionDto }) userCorrection!: FoodCorrectionDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) errorCategory!: string | null;
  @ApiProperty() consumptionStatus!: 'notConfirmed' | 'consumed';
  @ApiProperty() createdAt!: string;
}

export class FoodConsumptionResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() foodAnalysisId!: string;
  @ApiProperty() consumedAt!: string;
  @ApiProperty() localDate!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: FoodCorrectionDto }) confirmedResult!: FoodCorrectionDto;
}

export class FoodConsumptionPageDto {
  @ApiProperty({ type: [FoodConsumptionResourceDto] }) items!: FoodConsumptionResourceDto[];
}
