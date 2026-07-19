import { ApiProperty } from '@nestjs/swagger';
export class OnboardingCompletionResourceDto {
  @ApiProperty({ enum: ['completed'] }) onboardingStatus!: 'completed';
  @ApiProperty({ example: 100 }) starterTokensGranted!: number;
  @ApiProperty({ example: 100 }) tokenBalance!: number;
}
export class TokenWalletResourceDto {
  @ApiProperty({ nullable: true }) walletId!: string | null;
  @ApiProperty() availableBalance!: number;
}
