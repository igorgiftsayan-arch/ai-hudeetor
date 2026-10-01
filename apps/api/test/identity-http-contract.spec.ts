import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { IdentityController } from '../../../packages/backend/src/identity/transport/identity.controller';

describe('Identity HTTP success contract', () => {
  it.each([
    [
      'acceptProviderConsent',
      IdentityController.prototype.acceptProviderConsent,
    ],
    ['confirmEmail', IdentityController.prototype.confirmEmail],
    ['confirmReset', IdentityController.prototype.confirmReset],
  ])('returns 200 for %s', (_name, handler) => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.OK,
    );
  });
});
