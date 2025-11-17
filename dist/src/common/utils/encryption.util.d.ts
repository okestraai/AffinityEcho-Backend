import { ConfigService } from '@nestjs/config';
export declare class EncryptionUtil {
    private config;
    private key;
    private algorithm;
    constructor(config: ConfigService);
    encrypt(text: string): string;
    decrypt(encrypted: string): string;
}
