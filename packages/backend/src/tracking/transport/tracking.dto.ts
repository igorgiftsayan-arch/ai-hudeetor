import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateWeightEntryRequestDto {
  @ApiProperty({ example: 75.55, minimum: 20, maximum: 500, multipleOf: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  weightKg!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() recordedAt?: string;
}

export class WeightEntryResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() weightKg!: string;
  @ApiProperty() recordedAt!: string;
  @ApiProperty() source!: string;
}

export class CreateWeightEntryResponseDto extends WeightEntryResourceDto {
  @ApiProperty({ enum: ['created', 'updated'] })
  @IsIn(['created', 'updated'])
  result!: 'created' | 'updated';
}

export class WeightEntryPageDto {
  @ApiProperty({ type: () => [WeightEntryResourceDto] })
  items!: WeightEntryResourceDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
