import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { supabaseAdmin } from '../../database/supabase.client';
import { ConfigService } from '@nestjs/config';
import logger from '../../common/utils/logger.util';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // For WebSocket connections, context is different from HTTP
    const client = context.switchToWs().getClient();

    logger.info('🔐 WsJwtGuard: Starting WebSocket authentication', {
      clientId: client.id,
      clientData: client.data,
    });

    const token = this.extractTokenFromSocket(client);

    logger.info(`🔐 Token present: ${!!token}`, { clientId: client.id });

    if (!token) {
      logger.error('❌ WsJwtGuard: No token provided', { clientId: client.id });
      throw new WsException('No token provided');
    }

    logger.info(`🔐 Token preview: ${token.substring(0, 20)}...`, {
      clientId: client.id,
      tokenLength: token.length,
    });

    try {
      logger.info('🔐 Validating token with Supabase...', {
        clientId: client.id,
      });
      const { data, error } = await this.admin.auth.getUser(token);

      if (error) {
        logger.error('❌ Supabase validation error:', {
          clientId: client.id,
          error: {
            message: error.message,
            name: error.name,
            status: error.status,
          },
        });
        throw new WsException(`Token validation failed: ${error.message}`);
      }

      if (!data.user) {
        logger.error('❌ No user data returned from Supabase', {
          clientId: client.id,
        });
        throw new WsException('User not found');
      }

      logger.info('✅ Token validated successfully:', {
        clientId: client.id,
        userId: data.user.id,
        email: data.user.email,
        emailConfirmed: !!data.user.email_confirmed_at,
      });

      // Attach user to socket for later use
      client.data.user = {
        userId: data.user.id, // Store as userId for consistency
        sub: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata,
        username:
          data.user.user_metadata?.username || data.user.email?.split('@')[0],
      };

      logger.info(`✅ User authenticated: ${data.user.id}`, {
        clientId: client.id,
        userId: data.user.id,
      });
      return true;
    } catch (error: any) {
      logger.error('❌ WsJwtGuard error:', {
        clientId: client.id,
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof WsException) {
        throw error;
      }

      throw new WsException('Authentication failed');
    }
  }

  private extractTokenFromSocket(client: any): string | null {
    // Check handshake auth (preferred method)
    const handshakeToken = client.handshake.auth?.token;

    // Check handshake headers as fallback
    const headersToken = client.handshake.headers?.authorization;

    // Try to extract token from query parameters (for testing)
    const queryToken = client.handshake.query?.token;

    logger.debug('📝 Checking for token in handshake...', {
      clientId: client.id,
      hasHandshakeAuth: !!client.handshake.auth,
      hasHeaders: !!client.handshake.headers,
      hasQuery: !!client.handshake.query,
    });

    // Priority: handshake.auth.token > Authorization header > query.token
    if (handshakeToken) {
      logger.debug('📝 Using token from handshake.auth.token', {
        clientId: client.id,
      });
      return this.cleanToken(handshakeToken);
    }

    if (headersToken) {
      logger.debug('📝 Using token from Authorization header', {
        clientId: client.id,
      });
      const [type, token] = headersToken.split(' ');
      if (type === 'Bearer' && token) {
        return this.cleanToken(token);
      }
    }

    if (queryToken) {
      logger.debug('📝 Using token from query parameters', {
        clientId: client.id,
      });
      return this.cleanToken(queryToken);
    }

    logger.warn('📝 No token found in handshake', {
      clientId: client.id,
      handshakeKeys: Object.keys(client.handshake),
      authKeys: client.handshake.auth ? Object.keys(client.handshake.auth) : [],
      headerKeys: client.handshake.headers
        ? Object.keys(client.handshake.headers)
        : [],
      queryKeys: client.handshake.query
        ? Object.keys(client.handshake.query)
        : [],
    });
    return null;
  }

  private cleanToken(token: string): string {
    // Remove any quotes or extra characters
    return token.replace(/^["']|["']$/g, '').trim();
  }
}
