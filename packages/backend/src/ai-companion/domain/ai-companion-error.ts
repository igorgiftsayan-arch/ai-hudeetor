import { IdentityError } from '../../identity/domain/identity-error';

export class AiCompanionError extends IdentityError {
  constructor(
    code: string,
    status: number,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(code, status, message, details);
    this.name = 'AiCompanionError';
  }
}
