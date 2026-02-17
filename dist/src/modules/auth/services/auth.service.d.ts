import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { EmailService } from '../../../common/utils/email/email.service';
import { SignupDto } from '../dto/signup.dto';
import { LoginDto } from '../dto/login.dto';
import { SendOtpDto } from '../dto/otp.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordWithOtpDto } from '../dto/reset-password.dto';
import { RefreshTokenDto } from '../dto/password.dto';
import { OnboardingDataDto } from '../dto/onboarding.dto';
import { UserProfileResponse } from '../interfaces/user-profile.interface';
import { OnboardingService } from './onboarding.service';
export declare class AuthService {
    private config;
    private jwt;
    private encryption;
    private emailService;
    private onboardingService;
    private supabase;
    private admin;
    private otpStore;
    private readonly MAX_OTP_ATTEMPTS;
    private readonly OTP_COOLDOWN_MS;
    constructor(config: ConfigService, jwt: JwtService, encryption: EncryptionUtil, emailService: EmailService, onboardingService: OnboardingService);
    private validateEmail;
    private validatePassword;
    private validateUsername;
    private storeOtp;
    private verifyStoredOtp;
    signup(dto: SignupDto): Promise<{
        message: string;
        userId: string;
        email: string | undefined;
        requiresOtpVerification: boolean;
        profileCreated: boolean;
    }>;
    login(dto: LoginDto): Promise<{
        has_completed_onboarding: boolean;
        is_deactivated: boolean;
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
        };
    }>;
    socialLogin(provider: 'google' | 'facebook'): Promise<{
        url: string;
        provider: "google" | "facebook";
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
        method?: undefined;
    } | {
        message: string;
        method: string;
    }>;
    resetPasswordWithOtp(dto: ResetPasswordWithOtpDto & {
        otp: string;
    }): Promise<{
        message: string;
    }>;
    refresh(dto: RefreshTokenDto): Promise<{
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
        };
    }>;
    logout(userId?: string): Promise<{
        message: string;
        timestamp: string;
    }>;
    sendOtp(dto: SendOtpDto): Promise<{
        message: string;
    }>;
    resendOtp(dto: SendOtpDto): Promise<{
        message: string;
        attemptsRemaining: number;
    }>;
    verifyOtp(email: string, token: string): Promise<{
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
        };
    }>;
    completeOnboarding(userId: string, data: OnboardingDataDto): Promise<{
        message: string;
        has_completed_onboarding: boolean;
    }>;
    getOnboardingStatus(userId: string): Promise<{
        hasCompletedOnboarding: boolean;
    }>;
    getCurrentUser(userId: string): Promise<UserProfileResponse>;
    updateProfile(userId: string, updateData: any): Promise<UserProfileResponse>;
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{
        message: string;
    }>;
    private generateOtp;
    private cleanUserData;
    private createProfile;
    private createProfileWithUniqueUsername;
    private ensureProfileExists;
    private updateProfileEmail;
    private generateUniqueUsername;
    private generateUsername;
    private generateTokens;
}
