/**
 * AES-GCM encryption/decryption for OAuth tokens stored in D1.
 * Uses Web Crypto API (available in Cloudflare Workers).
 * 
 * Token format: base64(iv + ciphertext + tag)
 * - iv: 12 bytes
 * - ciphertext: variable
 * - tag: 16 bytes (included by AES-GCM)
 */

const IV_LENGTH = 12;
const ALGORITHM = 'AES-GCM';

async function importKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(
    hexKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  return crypto.subtle.importKey('raw', keyBytes, { name: ALGORITHM }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encrypt(plaintext: string, hexKey: string): Promise<string> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );
  // Concatenate iv + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  // Base64 encode
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded: string, hexKey: string): Promise<string> {
  const key = await importKey(hexKey);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}
