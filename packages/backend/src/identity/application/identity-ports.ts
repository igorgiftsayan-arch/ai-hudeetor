export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(encodedHash: string, password: string): Promise<boolean>;
}

export abstract class SessionTokenService {
  abstract issue(input: {
    userId: string;
    familyId?: string;
    rotatedFromId?: string;
  }): {
    session: CreateIdentitySessionInput;
    accessToken: string;
    refreshToken: string;
  };

  abstract hash(token: string): string;
}
import type { CreateIdentitySessionInput } from './identity-repository';
