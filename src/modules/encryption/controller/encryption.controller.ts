// src/modules/encryption/controller/encryption.controller.ts
import {
  Controller,
  Get,
  UseGuards,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import logger from '../../../common/utils/logger.util';
import { MSG } from '../../../common/constants/messages';

// Use simple interfaces instead of classes for DTOs
interface SessionData {
  key: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

@ApiTags('Encryption')
@Controller('encryption')
@ApiBearerAuth('access-token')
export class EncryptionController {
  private sessionKeys = new Map<string, SessionData>();
  private readonly SESSION_DURATION = 30 * 60 * 1000; // 30 minutes
  private masterKey: Buffer;

  constructor(private config: ConfigService) {
    // Initialize master key for backward compatibility
    const masterKeyBase64 = this.config.get<string>('ENCRYPTION_KEY');
    if (!masterKeyBase64) {
      throw new Error('ENCRYPTION_KEY is required');
    }
    this.masterKey = Buffer.from(masterKeyBase64, 'base64');

    // Clean up expired sessions every hour
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
  }

  @Post('session')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create a new encryption session',
    description:
      'Creates a temporary encryption session with a unique session ID. Session expires after 30 minutes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Encryption session created successfully',
  })
  async createEncryptionSession(@Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      const sessionKey = crypto.randomBytes(32).toString('base64');
      const sessionId = crypto.randomBytes(16).toString('hex');

      const expiresAt = new Date(Date.now() + this.SESSION_DURATION);

      this.sessionKeys.set(sessionId, {
        key: sessionKey,
        userId,
        expiresAt,
        createdAt: new Date(),
      });

      logger.info('Encryption session created', {
        userId,
        sessionId,
        expiresAt: expiresAt.toISOString(),
      });

      return {
        sessionId,
        expiresAt: expiresAt.toISOString(),
        algorithm: 'aes-256-gcm',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      logger.error('Failed to create encryption session', {
        userId,
        error: errorMessage,
      });
      throw new HttpException(
        'Failed to create encryption session',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('encrypt')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Encrypt data using session key',
    description: 'Encrypts the provided data using the temporary session key.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'string', example: 'Hello, this is a test message!' },
        sessionId: {
          type: 'string',
          example: 'a026fb3f99c17a2f6906e20361bdd465',
        },
      },
      required: ['data', 'sessionId'],
    },
    examples: {
      example1: {
        summary: 'Basic encryption example',
        value: {
          data: 'Hello, this is a test message!',
          sessionId: 'a026fb3f99c17a2f6906e20361bdd465',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Data encrypted successfully',
  })
  async encryptData(
    @Body() body: any,
    @Headers() headers: any,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const userId = headers['user-id'];

    try {
      // Log the raw body for debugging
      logger.debug('Encrypt request received', {
        userId,
        body: body,
        bodyType: typeof body,
      });

      // Validate request body
      if (!body || typeof body !== 'object') {
        throw new BadRequestException(
          'Invalid request body: must be a JSON object',
        );
      }

      if (!body.data || !body.sessionId) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      // Validate data types
      if (typeof body.data !== 'string') {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      if (typeof body.sessionId !== 'string') {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      this.validateSessionInternal(body.sessionId, userId);

      const session = this.sessionKeys.get(body.sessionId)!;
      const encrypted = await this.encryptWithKey(body.data, session.key);

      logger.debug('Data encrypted successfully', {
        userId,
        sessionId: body.sessionId,
        dataLength: body.data.length,
        encryptedLength: encrypted.length,
      });

      return { encryptedData: encrypted };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Encryption failed';

      logger.error('Data encryption failed', {
        userId,
        sessionId: body?.sessionId,
        error: errorMessage,
      });

      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new HttpException(
        'Encryption failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('encrypt/master')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Encrypt data using master key',
    description:
      'Encrypts data with the master key for permanent storage. Data can always be decrypted with master key.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'string', example: 'Hello, this is a test message!' },
      },
      required: ['data'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Data encrypted with master key successfully',
  })
  async encryptWithMasterKey(@Body() body: any, @Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      // Validate request body
      if (!body || typeof body !== 'object') {
        throw new BadRequestException(
          'Invalid request body: must be a JSON object',
        );
      }

      if (!body.data) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      if (typeof body.data !== 'string') {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      const encrypted = await this.encryptWithMasterKeyInternal(body.data);

      logger.debug('Data encrypted with master key', {
        userId,
        dataLength: body.data.length,
        encryptedLength: encrypted.length,
      });

      return { encryptedData: encrypted };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Master key encryption failed';

      logger.error('Master key encryption failed', {
        userId,
        error: errorMessage,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException(
        'Master key encryption failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('encrypt/hybrid')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Encrypt data with both session and master keys',
    description:
      'Returns both session-encrypted (temporary) and master-encrypted (permanent) versions of the data.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'string', example: 'Hello, this is a test message!' },
        sessionId: {
          type: 'string',
          example: 'a026fb3f99c17a2f6906e20361bdd465',
        },
      },
      required: ['data', 'sessionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Data encrypted with both keys successfully',
  })
  async hybridEncrypt(@Body() body: any, @Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      // Validate request body
      if (!body || typeof body !== 'object') {
        throw new BadRequestException(
          'Invalid request body: must be a JSON object',
        );
      }

      if (!body.data || !body.sessionId) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      if (typeof body.data !== 'string') {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      if (typeof body.sessionId !== 'string') {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      this.validateSessionInternal(body.sessionId, userId);
      const session = this.sessionKeys.get(body.sessionId)!;

      // Encrypt with session key (for current use)
      const sessionEncrypted = await this.encryptWithKey(
        body.data,
        session.key,
      );

      // Encrypt with master key (for permanent storage)
      const masterEncrypted = await this.encryptWithMasterKeyInternal(
        body.data,
      );

      logger.debug('Hybrid encryption completed', {
        userId,
        sessionId: body.sessionId,
        dataLength: body.data.length,
      });

      return {
        sessionEncrypted, // Use this for current operations (faster)
        masterEncrypted, // Save this to database (permanent)
        sessionId: body.sessionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Hybrid encryption failed';

      logger.error('Hybrid encryption failed', {
        userId,
        sessionId: body?.sessionId,
        error: errorMessage,
      });

      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new HttpException(
        'Hybrid encryption failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('decrypt')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Decrypt data using session key',
    description:
      'Decrypts the provided encrypted data using the temporary session key.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        encryptedData: {
          type: 'string',
          example: 'base64-encrypted-string-here',
        },
        sessionId: {
          type: 'string',
          example: 'a026fb3f99c17a2f6906e20361bdd465',
        },
      },
      required: ['encryptedData', 'sessionId'],
    },
    examples: {
      example1: {
        summary: 'Basic decryption example',
        value: {
          encryptedData: 'your-encrypted-data-here',
          sessionId: 'a026fb3f99c17a2f6906e20361bdd465',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Data decrypted successfully',
  })
  async decryptData(@Body() body: any, @Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      // Log the raw body for debugging
      logger.debug('Decrypt request received', {
        userId,
        body: body,
        bodyType: typeof body,
      });

      // Validate request body
      if (!body || typeof body !== 'object') {
        throw new BadRequestException(
          'Invalid request body: must be a JSON object',
        );
      }

      if (!body.encryptedData || !body.sessionId) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      // Validate data types
      if (typeof body.encryptedData !== 'string') {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      if (typeof body.sessionId !== 'string') {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      this.validateSessionInternal(body.sessionId, userId);

      const session = this.sessionKeys.get(body.sessionId)!;
      const decrypted = await this.decryptWithKey(
        body.encryptedData,
        session.key,
      );

      logger.debug('Data decrypted successfully', {
        userId,
        sessionId: body.sessionId,
        encryptedLength: body.encryptedData.length,
        decryptedLength: decrypted.length,
      });

      return { decryptedData: decrypted };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Decryption failed';

      logger.error('Data decryption failed', {
        userId,
        sessionId: body?.sessionId,
        error: errorMessage,
      });

      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new HttpException(
        'Decryption failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('decrypt/master')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Decrypt data using master key',
    description:
      'Decrypts data that was encrypted with the master key (for permanent storage).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        encryptedData: {
          type: 'string',
          example: 'base64-encrypted-string-here',
        },
      },
      required: ['encryptedData'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Data decrypted with master key successfully',
  })
  async decryptWithMasterKey(@Body() body: any, @Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      // Validate request body
      if (!body || typeof body !== 'object') {
        throw new BadRequestException(
          'Invalid request body: must be a JSON object',
        );
      }

      if (!body.encryptedData) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      if (typeof body.encryptedData !== 'string') {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      const decrypted = await this.decryptWithMasterKeyInternal(
        body.encryptedData,
      );

      logger.debug('Data decrypted with master key', {
        userId,
        encryptedLength: body.encryptedData.length,
        decryptedLength: decrypted.length,
      });

      return { decryptedData: decrypted };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Master key decryption failed';

      logger.error('Master key decryption failed', {
        userId,
        error: errorMessage,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException(
        'Master key decryption failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('decrypt/legacy')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Decrypt legacy data using master key',
    description:
      'Decrypts data that was encrypted with the master key (for backward compatibility).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        encryptedData: {
          type: 'string',
          example: 'base64-encrypted-string-here',
        },
      },
      required: ['encryptedData'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Legacy data decrypted successfully',
  })
  async decryptLegacyData(@Body() body: any, @Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      // Validate request body
      if (!body || !body.encryptedData) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      const decrypted = await this.decryptWithMasterKeyInternal(
        body.encryptedData,
      );

      logger.debug('Legacy data decrypted successfully', {
        userId,
        encryptedLength: body.encryptedData.length,
        decryptedLength: decrypted.length,
      });

      return { decryptedData: decrypted };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Legacy decryption failed';

      logger.error('Legacy data decryption failed', {
        userId,
        error: errorMessage,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException(
        'Legacy decryption failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('session/check')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Check encryption session',
    description:
      'Check if an encryption session is still valid and not expired.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          example: 'a026fb3f99c17a2f6906e20361bdd465',
        },
      },
      required: ['sessionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Session check result',
  })
  async checkSession(@Body() body: any, @Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      // Validate request body
      if (!body || !body.sessionId) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      const session = this.sessionKeys.get(body.sessionId);

      if (!session || session.userId !== userId) {
        return {
          valid: false,
          expiresAt: '',
          createdAt: '',
        };
      }

      const isValid = new Date() <= session.expiresAt;

      return {
        valid: isValid,
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Session check failed';

      logger.error('Session check failed', {
        userId,
        sessionId: body?.sessionId,
        error: errorMessage,
      });

      return {
        valid: false,
        expiresAt: '',
        createdAt: '',
      };
    }
  }

  @Post('session/refresh')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: 'Refresh encryption session',
    description:
      'Extend the expiration time of an existing encryption session.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          example: 'a026fb3f99c17a2f6906e20361bdd465',
        },
      },
      required: ['sessionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Session refreshed successfully',
  })
  async refreshSession(@Body() body: any, @Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      // Validate request body
      if (!body || !body.sessionId) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      this.validateSessionInternal(body.sessionId, userId);

      const session = this.sessionKeys.get(body.sessionId)!;
      session.expiresAt = new Date(Date.now() + this.SESSION_DURATION);

      logger.info('Encryption session refreshed', {
        userId,
        sessionId: body.sessionId,
        newExpiresAt: session.expiresAt.toISOString(),
      });

      return {
        sessionId: body.sessionId,
        expiresAt: session.expiresAt.toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Session refresh failed';

      logger.error('Session refresh failed', {
        userId,
        sessionId: body?.sessionId,
        error: errorMessage,
      });

      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new HttpException(
        'Session refresh failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('sessions/count')
  @ApiOperation({
    summary: 'Get active session count (Admin)',
    description:
      'Returns the number of active encryption sessions. For monitoring purposes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session count retrieved successfully',
  })
  async getActiveSessionCount() {
    const now = new Date();
    const activeSessions = Array.from(this.sessionKeys.values()).filter(
      (session) => now <= session.expiresAt,
    ).length;

    return {
      activeSessions,
      totalSessions: this.sessionKeys.size,
      timestamp: now.toISOString(),
    };
  }

  @Post('migrate/session-to-master')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Migrate session-encrypted data to master encryption',
    description:
      'Decrypts session-encrypted data and re-encrypts with master key before session expires.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionEncryptedData: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['sessionEncryptedData', 'sessionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Data migrated to master encryption successfully',
  })
  async migrateSessionToMaster(@Body() body: any, @Headers() headers: any) {
    const userId = headers['user-id'];

    try {
      if (!body?.sessionEncryptedData || !body?.sessionId) {
        throw new BadRequestException(MSG.ENCRYPTION.INVALID_DATA);
      }

      this.validateSessionInternal(body.sessionId, userId);
      const session = this.sessionKeys.get(body.sessionId)!;

      // Decrypt with session key
      const decrypted = await this.decryptWithKey(
        body.sessionEncryptedData,
        session.key,
      );

      // Re-encrypt with master key
      const masterEncrypted =
        await this.encryptWithMasterKeyInternal(decrypted);

      logger.info('Data migrated from session to master encryption', {
        userId,
        sessionId: body.sessionId,
        dataLength: decrypted.length,
      });

      return {
        masterEncrypted,
        decryptedData: decrypted, // Optional: return decrypted for verification
        sessionId: body.sessionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Migration failed';

      logger.error('Session to master migration failed', {
        userId,
        sessionId: body?.sessionId,
        error: errorMessage,
      });

      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new HttpException(
        'Migration failed - session may have expired',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private validateSessionInternal(sessionId: string, userId: string): void {
    const session = this.sessionKeys.get(sessionId);

    if (!session) {
      throw new UnauthorizedException(MSG.ENCRYPTION.INVALID_SESSION);
    }

    if (session.userId !== userId) {
      throw new UnauthorizedException(MSG.ENCRYPTION.SESSION_MISMATCH);
    }

    if (new Date() > session.expiresAt) {
      // Remove expired session
      this.sessionKeys.delete(sessionId);
      throw new UnauthorizedException(MSG.ENCRYPTION.SESSION_EXPIRED);
    }
  }

  private async encryptWithKey(text: string, key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const keyBuffer = Buffer.from(key, 'base64');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

        let encrypted = cipher.update(text, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const tag = cipher.getAuthTag();

        const result = Buffer.concat([iv, tag, encrypted]).toString('base64');
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async decryptWithKey(
    encryptedData: string,
    key: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const keyBuffer = Buffer.from(key, 'base64');
        const data = Buffer.from(encryptedData, 'base64');
        const iv = data.slice(0, 12);
        const tag = data.slice(12, 28);
        const text = data.slice(28);

        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(text, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        resolve(decrypted);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async encryptWithMasterKeyInternal(text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

        let encrypted = cipher.update(text, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const tag = cipher.getAuthTag();

        const result = Buffer.concat([iv, tag, encrypted]).toString('base64');
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async decryptWithMasterKeyInternal(
    encryptedData: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const data = Buffer.from(encryptedData, 'base64');
        const iv = data.slice(0, 12);
        const tag = data.slice(12, 28);
        const text = data.slice(28);

        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          this.masterKey,
          iv,
        );
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(text, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        resolve(decrypted);
      } catch (error) {
        reject(error);
      }
    });
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    let expiredCount = 0;

    for (const [sessionId, session] of this.sessionKeys.entries()) {
      if (now > session.expiresAt) {
        this.sessionKeys.delete(sessionId);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.debug('Cleaned up expired sessions', {
        expiredCount,
        remainingSessions: this.sessionKeys.size,
      });
    }
  }
}
