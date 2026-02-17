import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class JwtAuthGuard {
    private config;
    private supabase;
    constructor(config: ConfigService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractToken;
}
