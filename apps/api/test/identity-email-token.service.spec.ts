import { IdentityEmailTokenService } from '@atlas/backend';

describe('IdentityEmailTokenService', () => {
  it('stores a stable hash and authenticated encrypted delivery token', () => {
    const service = new IdentityEmailTokenService(
      'test-email-payload-secret-at-least-32-characters',
    );
    const issued = service.issue('verifyEmail', 60_000);
    expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.tokenCiphertext).not.toContain(issued.rawToken);
    expect(service.decrypt(issued)).toBe(issued.rawToken);
    expect(service.hash(issued.rawToken)).toBe(issued.tokenHash);
  });

  it('rejects ciphertext authentication with another encryption secret', () => {
    const first = new IdentityEmailTokenService(
      'first-email-payload-secret-at-least-32-characters',
    );
    const second = new IdentityEmailTokenService(
      'second-email-payload-secret-at-least-32-characters',
    );
    expect(() =>
      second.decrypt(first.issue('passwordReset', 60_000)),
    ).toThrow();
  });
});
