import { hash, verify, argon2id } from 'argon2';
import { PasswordHasher } from '../application/identity-ports';

export class Argon2PasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(encodedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(encodedHash, password);
    } catch {
      return false;
    }
  }
}
