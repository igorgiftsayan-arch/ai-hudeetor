import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEmail,
  IsIn,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class ConsentAcceptanceDto {
  @ApiProperty({ enum: ['terms', 'privacy'] })
  @IsIn(['terms', 'privacy'])
  consentType!: 'terms' | 'privacy';

  @ApiProperty({ example: 'v1' })
  @IsString()
  @Length(1, 100)
  documentVersion!: string;

  @ApiProperty({ enum: [true] })
  @IsBoolean()
  @IsIn([true])
  accepted!: true;
}

export class RegistrationRequestDto {
  @ApiProperty({ example: 'person@example.com', maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(12, 128)
  @Matches(/[\p{L}]/u)
  @Matches(/\d/u)
  password!: string;

  @ApiProperty({ enum: [true] })
  @IsBoolean()
  @IsIn([true])
  ageConfirmed!: true;

  @ApiProperty({ type: () => [ConsentAcceptanceDto], minItems: 2, maxItems: 2 })
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => ConsentAcceptanceDto)
  consents!: ConsentAcceptanceDto[];
}

export class CreateSessionRequestDto {
  @ApiProperty({ example: 'person@example.com', maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @ApiProperty({ maxLength: 128, writeOnly: true })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class RegistrationResourceDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({
    enum: ['registered', 'profileReady', 'personaReady', 'completed'],
  })
  onboardingStatus!:
    'registered' | 'profileReady' | 'personaReady' | 'completed';

  @ApiProperty({ format: 'date-time' })
  sessionExpiresAt!: string;

  @ApiProperty()
  csrfToken!: string;

  @ApiProperty()
  emailVerified!: boolean;
}

export class SessionResourceDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({
    enum: ['registered', 'profileReady', 'personaReady', 'completed'],
  })
  onboardingStatus!:
    'registered' | 'profileReady' | 'personaReady' | 'completed';

  @ApiProperty()
  csrfToken!: string;

  @ApiProperty()
  emailVerified!: boolean;
}

export class CurrentUserResourceDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({
    enum: ['registered', 'profileReady', 'personaReady', 'completed'],
  })
  onboardingStatus!:
    'registered' | 'profileReady' | 'personaReady' | 'completed';

  @ApiProperty()
  emailVerified!: boolean;
}

export class IdentityAcceptedResourceDto {
  @ApiProperty({ enum: [true] }) accepted!: true;
}

export class VerifyEmailRequestDto {
  @ApiProperty({ minLength: 20, writeOnly: true })
  @IsString()
  @Length(20, 200)
  token!: string;
}

export class EmailVerificationResourceDto {
  @ApiProperty({ enum: [true] }) emailVerified!: true;
}

export class PasswordResetRequestDto {
  @ApiProperty({ example: 'person@example.com', maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;
}

export class ResetPasswordRequestDto {
  @ApiProperty({ minLength: 20, writeOnly: true })
  @IsString()
  @Length(20, 200)
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(12, 128)
  @Matches(/[\p{L}]/u)
  @Matches(/\d/u)
  newPassword!: string;
}

export class PasswordResetResourceDto {
  @ApiProperty({ enum: [true] }) passwordReset!: true;
}

export class AiProviderConsentResourceDto {
  @ApiProperty() accepted!: boolean;
  @ApiProperty() currentVersion!: string;
  @ApiProperty({ nullable: true, type: String }) acceptedVersion!: string | null;
  @ApiProperty() disclosure!: string;
}

export class AcceptAiProviderConsentRequestDto {
  @ApiProperty() @IsString() @Length(1, 100) documentVersion!: string;
  @ApiProperty({ enum: [true] }) @IsBoolean() @IsIn([true]) accepted!: true;
}
