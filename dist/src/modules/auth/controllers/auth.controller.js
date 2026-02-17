"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("../services/auth.service");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../guards/jwt-auth.guard");
const login_dto_1 = require("../dto/login.dto");
const signup_dto_1 = require("../dto/signup.dto");
const otp_dto_1 = require("../dto/otp.dto");
const auth_response_dto_1 = require("../dto/auth-response.dto");
const password_dto_1 = require("../dto/password.dto");
const update_profile_dto_1 = require("../dto/update-profile.dto");
const onboarding_dto_1 = require("../dto/onboarding.dto");
const reset_password_dto_1 = require("../dto/reset-password.dto");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async signup(dto) {
        return this.authService.signup(dto);
    }
    async login(dto) {
        return this.authService.login(dto);
    }
    async socialLogin(provider) {
        return this.authService.socialLogin(provider);
    }
    async forgotPassword(dto) {
        return this.authService.forgotPassword(dto);
    }
    async resetPassword(dto) {
        return this.authService.resetPasswordWithOtp(dto);
    }
    async refresh(dto) {
        return this.authService.refresh(dto);
    }
    async logout(user) {
        return this.authService.logout(user?.userId);
    }
    async me(user) {
        return this.authService.getCurrentUser(user.userId);
    }
    async resendOtp(dto) {
        return this.authService.resendOtp(dto);
    }
    async verifyOtp(dto) {
        return this.authService.verifyOtp(dto.email, dto.token);
    }
    async updateProfile(user, dto) {
        return this.authService.updateProfile(user.userId, dto);
    }
    async changePassword(user, dto) {
        return this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
    }
    async completeOnboarding(user, dto) {
        return this.authService.completeOnboarding(user.userId, dto);
    }
    async getOnboardingStatus(user) {
        return this.authService.getOnboardingStatus(user.userId);
    }
    async health() {
        return {
            status: 'ok',
            service: 'auth',
            timestamp: new Date().toISOString(),
        };
    }
    async getSession(user) {
        const issuedAt = new Date(user.iat * 1000);
        const expiresAt = new Date(user.exp * 1000);
        return {
            userId: user.userId,
            email: user.email,
            issuedAt: issuedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            timeRemaining: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
        };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('signup'),
    (0, swagger_1.ApiOperation)({
        summary: 'Sign up with email and password',
        description: 'Create a new user account. An OTP will be sent for email verification.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'User registered successfully. Check email for OTP verification.',
        schema: {
            example: {
                message: 'Registration successful! Please check your email for the verification code.',
                userId: 'uuid-string',
                email: 'user@example.com',
                requiresOtpVerification: true,
                profileCreated: true,
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid input data or email already exists',
    }),
    (0, swagger_1.ApiResponse)({
        status: 409,
        description: 'Username or email already taken',
    }),
    (0, swagger_1.ApiBody)({ type: signup_dto_1.SignupDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [signup_dto_1.SignupDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "signup", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login'),
    (0, swagger_1.ApiOperation)({
        summary: 'Login with email and password',
        description: 'Authenticate user with email and password. Returns access and refresh tokens.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        type: auth_response_dto_1.AuthResponseDto,
        description: 'Login successful. Returns JWT tokens.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Invalid credentials or email not confirmed',
    }),
    (0, swagger_1.ApiBody)({ type: login_dto_1.LoginDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('login/:provider'),
    (0, swagger_1.ApiOperation)({
        summary: 'Social login (Google/Facebook)',
        description: 'Initiate OAuth flow for social login. Returns redirect URL.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'provider',
        enum: ['google', 'facebook'],
        description: 'OAuth provider',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'OAuth URL generated successfully',
        schema: {
            example: {
                url: 'https://accounts.google.com/o/oauth2/auth?...',
                provider: 'google',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Unsupported provider',
    }),
    __param(0, (0, common_1.Param)('provider')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "socialLogin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('forgot-password'),
    (0, swagger_1.ApiOperation)({
        summary: 'Request password reset',
        description: 'Send password reset link to email. Works even if email does not exist (for security).',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Password reset email sent if account exists',
        schema: {
            example: {
                message: 'If an account exists with this email, a password reset link has been sent.',
            },
        },
    }),
    (0, swagger_1.ApiBody)({ type: password_dto_1.ForgotPasswordDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [password_dto_1.ForgotPasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('reset-password'),
    (0, swagger_1.ApiOperation)({
        summary: 'Reset password with token',
        description: 'Reset password using token from email. Token is required.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Password reset successful',
        schema: {
            example: {
                message: 'Password has been reset successfully.',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid or expired token',
    }),
    (0, swagger_1.ApiBody)({ type: reset_password_dto_1.ResetPasswordWithOtpDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reset_password_dto_1.ResetPasswordWithOtpDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, swagger_1.ApiOperation)({
        summary: 'Refresh access token',
        description: 'Get new access token using refresh token. Refresh token must be valid and not expired.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'New access token generated',
        schema: {
            example: {
                access_token: 'new-jwt-token',
                token_type: 'Bearer',
                expires_in: 900,
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Invalid or expired refresh token',
    }),
    (0, swagger_1.ApiBody)({ type: password_dto_1.RefreshTokenDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [password_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Post)('logout'),
    (0, swagger_1.ApiOperation)({
        summary: 'Logout user',
        description: 'Invalidate current session and logout user. Requires valid JWT token.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Logout successful',
        schema: {
            example: {
                message: 'Logged out successfully',
                timestamp: '2024-01-01T00:00:00.000Z',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Unauthorized - invalid token',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get current user profile',
        description: 'Get complete user profile information for authenticated user.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'User profile retrieved successfully',
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Unauthorized - invalid token',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('otp/resend'),
    (0, swagger_1.ApiOperation)({
        summary: 'Resend OTP for email verification',
        description: 'Resend one-time password for email verification. Limited to 3 attempts every 5 minutes.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'OTP resent successfully',
        schema: {
            example: {
                message: 'A new verification code has been sent to user@example.com.',
                attemptsRemaining: 2,
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid email, rate limit exceeded, or email already verified',
    }),
    (0, swagger_1.ApiBody)({ type: otp_dto_1.SendOtpDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [otp_dto_1.SendOtpDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resendOtp", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('otp/verify'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify OTP for email verification',
        description: 'Verify one-time password sent during signup to confirm email address. Returns JWT tokens on success.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        type: auth_response_dto_1.AuthResponseDto,
        description: 'OTP verified and email confirmed successfully',
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Invalid or expired OTP',
    }),
    (0, swagger_1.ApiBody)({ type: otp_dto_1.VerifyOtpDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [otp_dto_1.VerifyOtpDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyOtp", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Put)('profile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Update user profile',
        description: 'Update authenticated user profile information. Only allowed fields can be updated.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Profile updated successfully',
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid profile data',
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Unauthorized - invalid token',
    }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.UpdateProfileDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Patch)('change-password'),
    (0, swagger_1.ApiOperation)({
        summary: 'Change password',
        description: 'Change user password. Requires current password for verification.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Password changed successfully',
        schema: {
            example: {
                message: 'Password changed successfully',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid current password or weak new password',
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Unauthorized - invalid token',
    }),
    (0, swagger_1.ApiBody)({ type: password_dto_1.ChangePasswordDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, password_dto_1.ChangePasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Post)('onboarding/complete'),
    (0, swagger_1.ApiOperation)({
        summary: 'Complete user onboarding',
        description: 'Save user onboarding data including demographics, career information, and preferences. Encrypts sensitive data.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Onboarding completed successfully',
        schema: {
            example: {
                message: 'Onboarding completed successfully',
                user: {
                    id: 'uuid-string',
                    username: 'username',
                    has_completed_onboarding: true,
                    career_level: 'Mid-level',
                    company: 'Tech Corp',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid onboarding data',
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Unauthorized - invalid token',
    }),
    (0, swagger_1.ApiBody)({ type: onboarding_dto_1.OnboardingDataDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, onboarding_dto_1.OnboardingDataDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "completeOnboarding", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Get)('onboarding/status'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get onboarding status',
        description: 'Check if user has completed onboarding and get current onboarding data. Returns decrypted sensitive data.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Onboarding status retrieved',
        schema: {
            example: {
                hasCompletedOnboarding: true,
                currentData: {
                    careerLevel: 'Mid-level',
                    company: 'Tech Corp',
                    affinityTags: ['black-women-tech', 'women-leadership'],
                    isWillingToMentor: true,
                    race: 'Black/African American',
                    gender: 'Woman',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Unauthorized - invalid token',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getOnboardingStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({
        summary: 'Auth service health check',
        description: 'Check if authentication service is running and healthy.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Service is healthy',
        schema: {
            example: {
                status: 'ok',
                service: 'auth',
                timestamp: '2024-01-01T00:00:00.000Z',
            },
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "health", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Get)('session'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get session information',
        description: 'Get current session information including token expiration.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Session information retrieved',
        schema: {
            example: {
                userId: 'uuid-string',
                email: 'user@example.com',
                issuedAt: '2024-01-01T00:00:00.000Z',
                expiresAt: '2024-01-01T00:15:00.000Z',
                timeRemaining: 895,
            },
        },
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getSession", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map