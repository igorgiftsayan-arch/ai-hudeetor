import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  personaIds,
  responseLengthValues,
  strictnessValues,
  type PersonaId,
  type ResponseLength,
  type Strictness,
} from '../domain/profile-types';

export class WellnessNoticeConsentDto {
  @ApiProperty({ enum: ['aiWellnessNotice'] })
  @IsIn(['aiWellnessNotice'])
  consentType!: 'aiWellnessNotice';
  @ApiProperty({ example: 'test-v1' })
  @IsString()
  @Length(1, 100)
  documentVersion!: string;
  @ApiProperty({ enum: [true] }) @IsBoolean() @IsIn([true]) accepted!: true;
}
export class UpdateProfileRequestDto {
  @ApiProperty({ example: 'Asia/Irkutsk', maxLength: 64 })
  @IsString()
  @Length(1, 64)
  timezone!: string;
  @ApiPropertyOptional({ nullable: true, minLength: 1, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string | null;
  @ApiPropertyOptional({ nullable: true, minimum: 20, maximum: 500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(20)
  @Max(500)
  targetWeightKg?: number | null;
  @ApiPropertyOptional({ type: () => [WellnessNoticeConsentDto], maxItems: 1 })
  @IsOptional()
  @ArrayMaxSize(1)
  @ValidateNested({ each: true })
  @Type(() => WellnessNoticeConsentDto)
  consents?: WellnessNoticeConsentDto[];
}
export class AiPreferenceRequestDto {
  @ApiProperty({ enum: personaIds }) @IsIn(personaIds) personaId!: PersonaId;
  @ApiPropertyOptional({ enum: strictnessValues })
  @IsOptional()
  @IsIn(strictnessValues)
  strictness?: Strictness;
  @ApiPropertyOptional({ enum: responseLengthValues })
  @IsOptional()
  @IsIn(responseLengthValues)
  responseLength?: ResponseLength;
}
export class UserProfileResourceDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() timezone!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
  @ApiPropertyOptional({ nullable: true }) targetWeightKg!: number | null;
  @ApiProperty({
    enum: ['registered', 'profileReady', 'personaReady', 'completed'],
  })
  onboardingStatus!: string;
}
export class AiPreferenceResourceDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ enum: personaIds }) personaId!: PersonaId;
  @ApiProperty({ enum: strictnessValues }) strictness!: Strictness;
  @ApiProperty({ enum: responseLengthValues }) responseLength!: ResponseLength;
  @ApiProperty({
    enum: ['registered', 'profileReady', 'personaReady', 'completed'],
  })
  onboardingStatus!: string;
}
export class OnboardingResourceDto {
  @ApiProperty({
    enum: ['registered', 'profileReady', 'personaReady', 'completed'],
  })
  status!: string;
  @ApiProperty({ type: [String] }) completedSteps!: string[];
  @ApiProperty({ type: [String] }) requiredSteps!: string[];
  @ApiProperty({ enum: [false] }) canComplete!: false;
  @ApiProperty() aiWellnessNoticeVersion!: string;
  @ApiProperty() csrfToken!: string;
  @ApiPropertyOptional({ type: UserProfileResourceDto })
  profile?: UserProfileResourceDto;
  @ApiPropertyOptional({ type: AiPreferenceResourceDto })
  aiPreference?: AiPreferenceResourceDto;
}
