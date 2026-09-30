import { doubleCsrf } from 'csrf-csrf';
import type { NextFunction, Request, Response } from 'express';
import { identityErrors } from '../domain/identity-error';

export interface IdentitySecurityOptions {
  corsOrigin: string;
  csrfSecret: string;
  secureCookies: boolean;
  accessTtlMs: number;
  refreshTtlMs: number;
  termsVersion: string;
  privacyVersion: string;
  aiWellnessNoticeVersion: string;
  redisUrl: string;
  loginMaxAttempts: number;
  loginWindowMs: number;
  registrationMaxAttempts: number;
  registrationWindowMs: number;
}

const csrfCookieName = 'atlas_csrf';
const refreshCookieName = 'atlas_refresh';

export class CsrfService {
  private readonly utilities;

  constructor(private readonly options: IdentitySecurityOptions) {
    this.utilities = this.createUtilities(
      (request) => request.cookies?.[refreshCookieName] ?? '',
    );
  }

  protect = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    if (this.shouldSkip(request)) {
      next();
      return;
    }
    if (
      !this.isTrustedOrigin(request) ||
      !this.utilities.validateRequest(request)
    ) {
      next(identityErrors.csrfValidationFailed());
      return;
    }
    next();
  };

  assertTrustedOrigin(request: Request): void {
    if (!this.isTrustedOrigin(request)) {
      throw identityErrors.originValidationFailed();
    }
  }

  generate(
    request: Request,
    response: Response,
    sessionIdentifier: string,
  ): string {
    return this.createUtilities(() => sessionIdentifier).generateCsrfToken(
      request,
      response,
      { overwrite: true },
    );
  }

  clear(response: Response): void {
    response.clearCookie(csrfCookieName, this.cookieOptions());
  }

  private createUtilities(getSessionIdentifier: (request: Request) => string) {
    return doubleCsrf({
      getSecret: () => this.options.csrfSecret,
      getSessionIdentifier,
      cookieName: csrfCookieName,
      cookieOptions: this.cookieOptions(),
      ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
      getCsrfTokenFromRequest: (request) => request.headers['x-csrf-token'],
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.options.secureCookies,
      path: '/api/v1',
    };
  }

  private shouldSkip(request: Request): boolean {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    return (
      request.path === '/api/v1/registrations' ||
      request.path === '/api/v1/sessions'
    );
  }

  private isTrustedOrigin(request: Request): boolean {
    const origin = request.header('origin');
    const referer = request.header('referer');
    return (
      origin === this.options.corsOrigin ||
      (!origin &&
        typeof referer === 'string' &&
        referer.startsWith(`${this.options.corsOrigin}/`))
    );
  }
}
