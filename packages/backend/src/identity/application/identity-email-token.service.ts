import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { CreateIdentityEmailTokenInput } from './identity-repository';

export class IdentityEmailTokenService {
  private readonly encryptionKey: Buffer;

  constructor(secret: string) {
    this.encryptionKey = createHash('sha256').update(secret).digest();
  }

  issue(
    template: 'verifyEmail' | 'passwordReset',
    ttlMs: number,
  ): CreateIdentityEmailTokenInput & { rawToken: string } {
    const rawToken = randomBytes(32).toString('base64url');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(rawToken, 'utf8'),
      cipher.final(),
    ]);
    return {
      id: randomUUID(),
      deliveryId: randomUUID(),
      rawToken,
      tokenHash: this.hash(rawToken),
      expiresAt: new Date(Date.now() + ttlMs),
      template,
      tokenCiphertext: ciphertext.toString('base64url'),
      tokenIv: iv.toString('base64url'),
      tokenAuthTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  decrypt(input: {
    tokenCiphertext: string;
    tokenIv: string;
    tokenAuthTag: string;
  }): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(input.tokenIv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(input.tokenAuthTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(input.tokenCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
