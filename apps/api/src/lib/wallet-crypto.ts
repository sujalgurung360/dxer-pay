import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { logger } from './logger.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * DXER Wallet Encryption — AES-256-GCM
 * ═══════════════════════════════════════════════════════════════
 *
 * Encrypts/decrypts wallet private keys using AES-256-GCM, the
 * gold standard for authenticated encryption. Even with full
 * database access, keys cannot be decrypted without the
 * WALLET_ENCRYPTION_KEY environment variable.
 *
 * Format: base64(iv:authTag:ciphertext)
 *   - iv: 12-byte initialization vector (random per encryption)
 *   - authTag: 16-byte authentication tag (tamper detection)
 *   - ciphertext: encrypted private key
 *
 * The encryption key is derived from WALLET_ENCRYPTION_KEY via
 * SHA-256, ensuring a consistent 32-byte key regardless of input.
 *
 * IMPORTANT: WALLET_ENCRYPTION_KEY must be set in .env and NEVER
 * committed to git, stored in the database, or shared. If lost,
 * all encrypted private keys become unrecoverable.
 * ═══════════════════════════════════════════════════════════════
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16;  // 128 bits

/**
 * Derive a 32-byte encryption key from the environment variable.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.WALLET_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'WALLET_ENCRYPTION_KEY is not set. This is required for wallet security. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a wallet private key using AES-256-GCM.
 *
 * @param privateKey - The raw private key string to encrypt
 * @returns Base64-encoded string containing iv + authTag + ciphertext
 */
export function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv + authTag + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a wallet private key from AES-256-GCM encrypted format.
 *
 * @param encryptedKey - Base64-encoded string from encryptPrivateKey()
 * @returns The original private key string
 * @throws If decryption fails (wrong key, tampered data, or legacy XOR format)
 */
export function decryptPrivateKey(encryptedKey: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encryptedKey, 'base64');

  // Check minimum length: iv(12) + authTag(16) + at least 1 byte ciphertext
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    // Likely a legacy XOR-encrypted key — try legacy decryption
    return decryptLegacyXOR(encryptedKey);
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err: any) {
    // If AES fails, try legacy XOR (for backward compatibility with old keys)
    logger.warn('AES-256-GCM decryption failed, attempting legacy XOR fallback');
    try {
      return decryptLegacyXOR(encryptedKey);
    } catch {
      throw new Error('Failed to decrypt private key: invalid key or tampered data');
    }
  }
}

/**
 * Legacy XOR decryption for backward compatibility with existing keys.
 * Only used as a fallback — new keys always use AES-256-GCM.
 */
function decryptLegacyXOR(encryptedKey: string): string {
  // Legacy used SUPABASE_JWT_SECRET
  const secret = process.env.SUPABASE_JWT_SECRET || 'fallback-secret';
  const key = createHash('sha256').update(secret).digest();
  const input = Buffer.from(encryptedKey, 'base64');
  const decrypted = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    decrypted[i] = input[i] ^ key[i % key.length];
  }
  const result = decrypted.toString('utf8');

  // Validate it looks like a private key (starts with 0x)
  if (result.startsWith('0x') && result.length === 66) {
    return result;
  }

  throw new Error('Legacy XOR decryption produced invalid result');
}

/**
 * Re-encrypt a legacy XOR-encrypted key with AES-256-GCM.
 * Used for migrating old keys to the new encryption format.
 */
export function migrateToAES(legacyEncryptedKey: string): string | null {
  try {
    const plainKey = decryptLegacyXOR(legacyEncryptedKey);
    if (plainKey.startsWith('0x') && plainKey.length === 66) {
      return encryptPrivateKey(plainKey);
    }
    return null;
  } catch {
    return null;
  }
}
