import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { SignupDto } from '../dto/signup.dto';
import { SendOtpDto, VerifyOtpDto } from '../dto/otp.dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
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
    forgotPassword({ email }: {
        email: string;
    }): Promise<{
        message: string;
    }>;
    resetPassword({ token, password }: {
        token: string;
        password: string;
    }): Promise<{
        message: string;
    }>;
    refresh({ refreshToken }: {
        refreshToken: string;
    }): Promise<{
        access_token: string;
    }>;
    logout(user: any): Promise<{
        message: string;
    }>;
    me(user: any): {
        id: any;
        email: any;
    };
    sendOtp(dto: SendOtpDto): Promise<{
        message: string;
    }>;
    verifyOtp(dto: VerifyOtpDto): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
}
