import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { SignupDto } from '../dto/signup.dto';
import { LoginDto } from '../dto/login.dto';
export declare class AuthService {
    private config;
    private jwt;
    private encryption;
    private supabase;
    private admin;
    constructor(config: ConfigService, jwt: JwtService, encryption: EncryptionUtil);
    signup(dto: SignupDto): Promise<{
        message: string;
    }>;
    login(dto: LoginDto): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    socialLogin(provider: 'google' | 'facebook'): Promise<{
        url: string;
    }>;
    forgotPassword(email: string): Promise<{
        message: string;
    }>;
    resetPassword(token: string, password: string): Promise<{
        message: string;
    }>;
    refresh(refreshToken: string): Promise<{
        access_token: string;
    }>;
    logout(userId?: string): Promise<{
        message: string;
    }>;
    private createProfile;
    private generateTokens;
    sendOtp(email: string): Promise<{
        message: string;
    }>;
    verifyOtp(email: string, token: string): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    private ensureProfileExists;
    private generateUsername;
}
