// src/common/utils/encryption.util.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionUtil {
  private key: Buffer;
  private algorithm = 'aes-256-gcm';

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('ENCRYPTION_KEY');

    if (!key || key.length !== 44) {
      throw new Error(
        'ENCRYPTION_KEY must be a 44-character base64 string (32 bytes)',
      );
    }

    this.key = Buffer.from(key, 'base64');

    // Log key fingerprint (first 6 chars only) for cross-environment debugging
    const keyFingerprint = key.substring(0, 6) + '...' + key.substring(key.length - 4);
    console.log(`[EncryptionUtil] Key fingerprint: ${keyFingerprint}, length: ${key.length}, bytes: ${this.key.length}`);

    // Verify the key is exactly 32 bytes
    if (this.key.length !== 32) {
      throw new Error(
        `Invalid key length: ${this.key.length} bytes. Expected 32 bytes.`,
      );
    }
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      this.algorithm,
      this.key,
      iv,
    ) as crypto.CipherGCM;
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(encrypted: string): string {
    const data = Buffer.from(encrypted, 'base64');
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const text = data.slice(28);
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      iv,
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);
    return decipher.update(text, undefined, 'utf8') + decipher.final('utf8');
  }
}
