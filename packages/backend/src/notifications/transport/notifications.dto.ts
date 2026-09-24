import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SavePushPreferenceDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiPropertyOptional({ example: '09:00' }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) localTime?: string;
  @ApiPropertyOptional({ example: 'Europe/Moscow' }) @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}

export class PushPreferenceResourceDto {
  @ApiProperty() enabled!: boolean;
  @ApiPropertyOptional() localTime!: string | null;
  @ApiPropertyOptional() timezone!: string | null;
  @ApiProperty({ enum: ['granted','denied','unsupported','notRequested'] }) permissionState!: string;
  @ApiProperty() activeSubscriptionCount!: number;
}

export class SavePushSubscriptionDto {
  @ApiProperty() @IsString() endpoint!: string;
  @ApiProperty() @IsString() p256dh!: string;
  @ApiProperty() @IsString() auth!: string;
  @ApiProperty({ enum: ['iosPwa','androidPwa','desktopPwa','unknown'] })
  @IsIn(['iosPwa','androidPwa','desktopPwa','unknown']) platform!: string;
  @ApiProperty({ enum: ['granted'] }) @IsIn(['granted']) permissionState!: 'granted';
}

export class PushSubscriptionResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() platform!: string;
  @ApiProperty() status!: string;
}
