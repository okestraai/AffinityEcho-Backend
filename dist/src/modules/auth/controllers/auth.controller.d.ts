import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { SignupDto } from '../dto/signup.dto';
import { SendOtpDto, VerifyOtpDto } from '../dto/otp.dto';
import { ForgotPasswordDto, RefreshTokenDto, ChangePasswordDto } from '../dto/password.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { OnboardingDataDto } from '../dto/onboarding.dto';
import { ResetPasswordWithOtpDto } from '../dto/reset-password.dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    signup(dto: SignupDto): Promise<{
        message: string;
        userId: string;
        email: string | undefined;
        requiresOtpVerification: boolean;
        profileCreated: boolean;
    }>;
    login(dto: LoginDto): Promise<{
        user: {
            permissions?: string[] | null | undefined;
            id: string;
            email: string | undefined;
            username: string;
            role: string;
            has_completed_onboarding: boolean;
            is_deactivated: boolean;
        };
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
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
    resetPassword(dto: ResetPasswordWithOtpDto): Promise<{
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
    logout(user: any): Promise<{
        message: string;
        timestamp: string;
    }>;
    me(user: any): Promise<import("../interfaces/user-profile.interface").UserProfileResponse>;
    resendOtp(dto: SendOtpDto): Promise<{
        message: string;
        attemptsRemaining: number;
    }>;
    verifyOtp(dto: VerifyOtpDto): Promise<{
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
        };
    }>;
    updateProfile(user: any, dto: UpdateProfileDto): Promise<import("../interfaces/user-profile.interface").UserProfileResponse>;
    changePassword(user: any, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
    completeOnboarding(user: any, dto: OnboardingDataDto): Promise<{
        message: string;
        has_completed_onboarding: boolean;
    }>;
    getOnboardingStatus(user: any): Promise<{
        hasCompletedOnboarding: boolean;
    }>;
    health(): Promise<{
        status: string;
        service: string;
        timestamp: string;
    }>;
    getSession(user: any): Promise<{
        userId: any;
        email: any;
        issuedAt: string;
        expiresAt: string;
        timeRemaining: number;
    }>;
}
