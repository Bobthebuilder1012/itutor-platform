import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Generate a proper 32-byte key from the environment variable
// Use SHA-256 hash to ensure consistent 32-byte key regardless of input length
// LAZY-LOADED: Only called at request time, not at module import time
function getEncryptionKey(): Buffer {
  const keyString = process.env.TOKEN_ENCRYPTION_KEY;
  
  if (!keyString) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set');
  }
  
  // Use SHA-256 to hash the key string into exactly 32 bytes
  return crypto.createHash('sha256').update(keyString).digest();
}

export function encrypt(text: string): string {
  const KEY = getEncryptionKey(); // Call at runtime, not module load time
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  const KEY = getEncryptionKey(); // Call at runtime, not module load time
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = parts.join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

