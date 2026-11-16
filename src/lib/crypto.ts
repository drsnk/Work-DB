const KDF_ITERATIONS = 250_000;
const KEY_CHECK_PLAINTEXT = 'FOLIOVAULT_AES256_GCM_VERIFIED_V1';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return toBase64(salt);
}

export async function deriveAesKey(
  passphrase: string,
  saltBase64: string,
  iterations = KDF_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBytes = fromBase64(saltBase64);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPayload<T>(
  key: CryptoKey,
  data: T
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoded
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptPayload<T>(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string
): Promise<T> {
  const iv = fromBase64(ivBase64);
  const ciphertext = fromBase64(ciphertextBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  const jsonText = new TextDecoder().decode(decrypted);
  return JSON.parse(jsonText) as T;
}

export async function createKeyCheck(
  key: CryptoKey
): Promise<{ iv: string; ciphertext: string }> {
  return encryptPayload(key, KEY_CHECK_PLAINTEXT);
}

export async function verifyKeyCheck(
  key: CryptoKey,
  iv: string,
  ciphertext: string
): Promise<boolean> {
  try {
    const result = await decryptPayload<string>(key, iv, ciphertext);
    return result === KEY_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export { KDF_ITERATIONS };
