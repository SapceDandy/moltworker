import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto';

// 32-byte hex key for testing
const TEST_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

describe('crypto', () => {
  it('encrypts and decrypts a string', async () => {
    const plaintext = 'my-secret-token-value';
    const encrypted = await encrypt(plaintext, TEST_KEY);
    expect(encrypted).not.toBe(plaintext);
    expect(typeof encrypted).toBe('string');

    const decrypted = await decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const plaintext = 'same-input';
    const enc1 = await encrypt(plaintext, TEST_KEY);
    const enc2 = await encrypt(plaintext, TEST_KEY);
    expect(enc1).not.toBe(enc2);

    // Both should decrypt to the same value
    expect(await decrypt(enc1, TEST_KEY)).toBe(plaintext);
    expect(await decrypt(enc2, TEST_KEY)).toBe(plaintext);
  });

  it('fails to decrypt with wrong key', async () => {
    const plaintext = 'secret';
    const encrypted = await encrypt(plaintext, TEST_KEY);
    const wrongKey = 'b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
    await expect(decrypt(encrypted, wrongKey)).rejects.toThrow();
  });

  it('handles empty string', async () => {
    const encrypted = await encrypt('', TEST_KEY);
    const decrypted = await decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe('');
  });

  it('handles long tokens', async () => {
    const longToken = 'ya29.' + 'a'.repeat(500);
    const encrypted = await encrypt(longToken, TEST_KEY);
    const decrypted = await decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(longToken);
  });

  it('handles unicode content', async () => {
    const unicode = 'token-with-emoji-🔐-and-日本語';
    const encrypted = await encrypt(unicode, TEST_KEY);
    const decrypted = await decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(unicode);
  });
});
