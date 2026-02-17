import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import logger from '../../common/utils/logger.util';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();

    logger.info('🔐 WsJwtGuard: Starting WebSocket authentication', {
      clientId: client.id,
    });

    const token = this.extractTokenFromSocket(client);

    if (!token) {
      logger.error('❌ WsJwtGuard: No token provided', { clientId: client.id });
      throw new WsException('No token provided');
    }

    logger.info(`🔐 Token extracted`, {
      clientId: client.id,
      tokenLength: token.length,
      tokenPreview: token.substring(0, 30) + '...',
    });

    try {
      // Get JWT secret from environment
      const jwtSecret = this.config.get<string>('JWT_SECRET');

      if (!jwtSecret) {
        logger.error('❌ JWT_SECRET not configured');
        throw new WsException('Server configuration error');
      }

      logger.info('🔐 Verifying token with JWT secret...', {
        clientId: client.id,
      });

      // Verify the token
      const decoded = jwt.verify(token, jwtSecret) as any;

      logger.info('✅ Token verified successfully:', {
        clientId: client.id,
        userId: decoded.sub,
        email: decoded.email,
      });

      // Attach user to socket
      client.data.user = {
        userId: decoded.sub,
        sub: decoded.sub,
        email: decoded.email,
        username: decoded.username || decoded.email?.split('@')[0],
      };

      logger.info(`✅ User authenticated: ${decoded.sub}`, {
        clientId: client.id,
        userId: decoded.sub,
      });

      return true;
    } catch (error: any) {
      logger.error('❌ WsJwtGuard error:', {
        clientId: client.id,
        errorName: error.name,
        errorMessage: error.message,
      });

      // Provide specific error messages
      if (error.name === 'TokenExpiredError') {
        throw new WsException('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new WsException('Invalid token');
      }

      throw new WsException('Authentication failed');
    }
  }

  private extractTokenFromSocket(client: any): string | null {
    // Check handshake auth (preferred method)
    const handshakeToken = client.handshake.auth?.token;
    if (handshakeToken) {
      logger.debug('📝 Token found in handshake.auth.token', {
        clientId: client.id,
      });
      return this.cleanToken(handshakeToken);
    }

    // Check handshake headers
    const headersToken = client.handshake.headers?.authorization;
    if (headersToken) {
      logger.debug('📝 Token found in Authorization header', {
        clientId: client.id,
      });
      const [type, token] = headersToken.split(' ');
      if (type === 'Bearer' && token) {
        return this.cleanToken(token);
      }
    }

    // Check query parameters
    const queryToken = client.handshake.query?.token;
    if (queryToken) {
      logger.debug('📝 Token found in query parameters', {
        clientId: client.id,
      });
      return this.cleanToken(queryToken);
    }

    logger.warn('📝 No token found', { clientId: client.id });
    return null;
  }

  private cleanToken(token: string): string {
    return token.replace(/^["']|["']$/g, '').trim();
  }
}
