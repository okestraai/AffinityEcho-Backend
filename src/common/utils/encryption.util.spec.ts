import { EncryptionUtil } from './encryption.util';

describe('EncryptionUtil', () => {
  // Valid 32-byte key encoded as base64 (44 chars)
  const validKey = Buffer.from('a'.repeat(32)).toString('base64');
  let encryption: EncryptionUtil;

  const mockConfig = {
    get: jest.fn().mockReturnValue(validKey),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    encryption = new EncryptionUtil(mockConfig);
  });

  it('should throw if ENCRYPTION_KEY is missing', () => {
    const badConfig = { get: jest.fn().mockReturnValue(undefined) } as any;
    expect(() => new EncryptionUtil(badConfig)).toThrow('ENCRYPTION_KEY must be a 44-character base64 string (32 bytes)');
  });

  it('should throw if ENCRYPTION_KEY has wrong length', () => {
    const badConfig = { get: jest.fn().mockReturnValue('short-key') } as any;
    expect(() => new EncryptionUtil(badConfig)).toThrow('ENCRYPTION_KEY must be a 44-character base64 string (32 bytes)');
  });

  it('should encrypt and decrypt text correctly', () => {
    const plaintext = 'Hello, World!';
    const encrypted = encryption.encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(typeof encrypted).toBe('string');

    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = 'Same text';
    const encrypted1 = encryption.encrypt(plaintext);
    const encrypted2 = encryption.encrypt(plaintext);

    expect(encrypted1).not.toBe(encrypted2);

    // But both should decrypt to the same plaintext
    expect(encryption.decrypt(encrypted1)).toBe(plaintext);
    expect(encryption.decrypt(encrypted2)).toBe(plaintext);
  });

  it('should handle empty string', () => {
    const encrypted = encryption.encrypt('');
    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('should handle unicode characters', () => {
    const plaintext = 'Hello \u{1F600} World \u00E9\u00E8\u00EA';
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw when decrypting tampered ciphertext', () => {
    const encrypted = encryption.encrypt('secret');
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    expect(() => encryption.decrypt(tampered)).toThrow();
  });
});
