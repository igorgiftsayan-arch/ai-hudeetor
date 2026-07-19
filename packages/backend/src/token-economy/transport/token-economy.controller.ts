import { Controller, Get, Headers, Inject, Post, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CompleteOnboardingUseCase } from '../application/complete-onboarding.use-case';
import { GetCurrentWalletUseCase } from '../application/get-current-wallet.use-case';
import { IdentityError } from '../../identity/domain/identity-error';
import {
  OnboardingCompletionResourceDto,
  TokenWalletResourceDto,
} from './token-economy.dto';
@ApiTags('token-economy')
@ApiCookieAuth()
@Controller()
export class TokenEconomyController {
  constructor(
    @Inject(CompleteOnboardingUseCase)
    private readonly complete: CompleteOnboardingUseCase,
    @Inject(GetCurrentWalletUseCase)
    private readonly wallet: GetCurrentWalletUseCase,
  ) {}
  @Post('users/me/onboarding-completions')
  @ApiCreatedResponse({ type: OnboardingCompletionResourceDto })
  completion(@Req() req: Request, @Headers('idempotency-key') key?: string) {
    if (!key || key.length < 16)
      throw new IdentityError(
        'IDEMPOTENCY_KEY_REQUIRED',
        400,
        'An idempotency key is required',
      );
    return this.complete.execute({
      accessToken: req.cookies?.atlas_access ?? '',
      idempotencyKey: key,
    });
  }
  @Get('token-wallets/current')
  @ApiOkResponse({ type: TokenWalletResourceDto })
  current(@Req() req: Request) {
    return this.wallet.execute(req.cookies?.atlas_access ?? '');
  }
}
