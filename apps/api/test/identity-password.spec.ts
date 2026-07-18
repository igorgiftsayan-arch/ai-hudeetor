import { Argon2PasswordHasher } from '@atlas/backend';

describe('Argon2PasswordHasher', () => {
  it('hashes passwords with Argon2id and verifies the correct password', async () => {
    const hasher = new Argon2PasswordHasher();

    const encoded = await hasher.hash('correct horse 123');

    expect(encoded).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(encoded, 'correct horse 123')).resolves.toBe(
      true,
    );
    await expect(hasher.verify(encoded, 'wrong password 123')).resolves.toBe(
      false,
    );
  });
});
