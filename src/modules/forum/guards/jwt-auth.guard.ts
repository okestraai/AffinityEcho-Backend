// src/auth/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    console.log('🔐 Using NestJS JWT validation');
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    console.log('🔐 JWT validation result:', { err, user, info });
    
    if (err || !user) {
      throw new UnauthorizedException('Invalid token');
    }
    
    return user;
  }
}