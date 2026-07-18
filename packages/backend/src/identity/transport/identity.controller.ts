import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  Inject,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CreateSessionUseCase } from '../application/create-session.use-case';
import { GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { RegisterUserUseCase } from '../application/register-user.use-case';
import { IdentityError } from '../domain/identity-error';
import type { IssuedIdentitySession } from '../domain/identity-types';
import { CsrfService, type IdentitySecurityOptions } from './csrf.service';
import {
  CreateSessionRequestDto,
  CurrentUserResourceDto,
  RegistrationRequestDto,
  RegistrationResourceDto,
  SessionResourceDto,
} from './identity.dto';
import { IDENTITY_SECURITY_OPTIONS } from './identity.tokens';

const accessCookieName = 'atlas_access';
const refreshCookieName = 'atlas_refresh';

@ApiTags('identity')
@Controller()
export class IdentityController {
  constructor(
    @Inject(RegisterUserUseCase)
    private readonly registerUser: RegisterUserUseCase,
    @Inject(CreateSessionUseCase)
    private readonly createSession: CreateSessionUseCase,
    @Inject(RefreshSessionUseCase)
    private readonly refreshSession: RefreshSessionUseCase,
    @Inject(GetCurrentUserUseCase)
    private readonly getCurrentUser: GetCurrentUserUseCase,
    @Inject(LogoutUseCase)
    private readonly logout: LogoutUseCase,
    @Inject(CsrfService)
    private readonly csrf: CsrfService,
    @Inject(IDENTITY_SECURITY_OPTIONS)
    private readonly security: IdentitySecurityOptions,
  ) {}

  @Post('registrations')
  @ApiBody({ type: RegistrationRequestDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: RegistrationResourceDto })
  async register(
    @Body() body: RegistrationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RegistrationResourceDto> {
    if (!idempotencyKey || !/^[!-~]{16,128}$/.test(idempotencyKey)) {
      throw new IdentityError(
        'IDEMPOTENCY_KEY_REQUIRED',
        400,
        'A valid Idempotency-Key header is required',
      );
    }
    const consentTypes = new Set(body.consents.map((item) => item.consentType));
    if (
      consentTypes.size !== 2 ||
      !consentTypes.has('terms') ||
      !consentTypes.has('privacy')
    ) {
      throw new IdentityError(
        'VALIDATION_ERROR',
        422,
        'Terms and privacy consent are required',
      );
    }
    const expectedConsentVersions = new Map([
      ['terms', this.security.termsVersion],
      ['privacy', this.security.privacyVersion],
    ]);
    if (
      body.consents.some(
        (consent) =>
          expectedConsentVersions.get(consent.consentType) !==
          consent.documentVersion,
      )
    ) {
      throw new IdentityError(
        'CONSENT_VERSION_OUTDATED',
        409,
        'A current consent document version is required',
      );
    }
    const result = await this.registerUser.execute({
      ...body,
      consents: body.consents,
      idempotencyKey,
    });
    const csrfToken = this.issueCookies(request, response, result.session);
    return {
      userId: result.user.id,
      onboardingStatus: result.user.onboardingStatus,
      sessionExpiresAt: result.session.accessExpiresAt.toISOString(),
      csrfToken,
    };
  }

  @Post('sessions')
  @ApiBody({ type: CreateSessionRequestDto })
  @ApiCreatedResponse({ type: SessionResourceDto })
  async login(
    @Body() body: CreateSessionRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResourceDto> {
    const session = await this.createSession.execute({
      ...body,
      attemptScope: `${request.ip}|${body.email.trim().toLowerCase()}`,
    });
    return {
      userId: session.userId,
      expiresAt: session.accessExpiresAt.toISOString(),
      onboardingStatus: 'registered',
      csrfToken: this.issueCookies(request, response, session),
    };
  }

  @Post('sessions/refreshes')
  @ApiCreatedResponse({ type: SessionResourceDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResourceDto> {
    const session = await this.refreshSession.execute(
      request.cookies?.[refreshCookieName] ?? '',
    );
    return {
      userId: session.userId,
      expiresAt: session.accessExpiresAt.toISOString(),
      onboardingStatus: 'registered',
      csrfToken: this.issueCookies(request, response, session),
    };
  }

  @Delete('sessions/current')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiNoContentResponse()
  async logoutCurrent(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.logout.execute(
      request.cookies?.[accessCookieName] ?? '',
      request.cookies?.[refreshCookieName] ?? '',
    );
    this.clearCookies(response);
  }

  @Get('users/me')
  @ApiCookieAuth()
  @ApiOkResponse({ type: CurrentUserResourceDto })
  async current(@Req() request: Request): Promise<CurrentUserResourceDto> {
    return this.getCurrentUser.execute(
      request.cookies?.[accessCookieName] ?? '',
    );
  }

  private issueCookies(
    request: Request,
    response: Response,
    session: IssuedIdentitySession,
  ): string {
    const common = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.security.secureCookies,
      path: '/api/v1',
    };
    response.cookie(accessCookieName, session.accessToken, {
      ...common,
      expires: session.accessExpiresAt,
    });
    response.cookie(refreshCookieName, session.refreshToken, {
      ...common,
      expires: session.refreshExpiresAt,
    });
    return this.csrf.generate(request, response, session.refreshToken);
  }

  private clearCookies(response: Response): void {
    const options = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.security.secureCookies,
      path: '/api/v1',
    };
    response.clearCookie(accessCookieName, options);
    response.clearCookie(refreshCookieName, options);
    this.csrf.clear(response);
  }
}
