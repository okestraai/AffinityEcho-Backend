import { ConfigService } from '@nestjs/config';
export declare class UserService {
    private config;
    private supabase;
    constructor(config: ConfigService);
    getProfile(userId: string): Promise<any>;
    updateProfile(userId: string, updates: any): Promise<any>;
}
