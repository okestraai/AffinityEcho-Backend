import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import logger from '../utils/logger.util';

@Injectable()
export class JwtAuthGuard {
  private jwtService: JwtService;
  private jwtSecret: string;

  constructor(private config: ConfigService) {
    this.jwtSecret = config.get<string>('JWT_SECRET') || '';
    this.jwtService = new JwtService({ secret: this.jwtSecret });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = this.jwtService.verify(token, { secret: this.jwtSecret });

      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Set user in request — CRITICAL for @CurrentUser() to work
      request.user = {
        sub: payload.sub,
        email: payload.email,
      };

      return true;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return null;
    return token;
  }
}
