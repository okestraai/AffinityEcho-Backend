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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const supabase_client_1 = require("../../../database/supabase.client");
const encryption_util_1 = require("../../../common/utils/encryption.util");
const email_service_1 = require("../../../common/utils/email/email.service");
const logger_util_1 = __importDefault(require("../../../common/utils/logger.util"));
const onboarding_service_1 = require("./onboarding.service");
let AuthService = class AuthService {
    constructor(config, jwt, encryption, emailService, onboardingService) {
        this.config = config;
        this.jwt = jwt;
        this.encryption = encryption;
        this.emailService = emailService;
        this.onboardingService = onboardingService;
        this.MAX_OTP_ATTEMPTS = 3;
        this.OTP_COOLDOWN_MS = 5 * 60 * 1000;
        this.supabase = (0, supabase_client_1.supabaseClient)(config);
        this.admin = (0, supabase_client_1.supabaseAdmin)(config);
        this.otpStore = new Map();
    }
    validateEmail(email) {
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return emailRegex.test(email) && email.length <= 254;
    }
    validatePassword(password) {
        if (!password || password.length < 8) {
            return {
                isValid: false,
                message: 'Password must be at least 8 characters long',
            };
        }
        return { isValid: true };
    }
    validateUsername(username) {
        if (!username || username.length < 3) {
            return {
                isValid: false,
                message: 'Username must be at least 3 characters long',
            };
        }
        if (username.length > 50) {
            return {
                isValid: false,
                message: 'Username must be less than 50 characters',
            };
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return {
                isValid: false,
                message: 'Username can only contain letters, numbers, and underscores',
            };
        }
        return { isValid: true };
    }
    async storeOtp(email, otp, type = 'signup') {
        const now = Date.now();
        this.otpStore.set(email.toLowerCase(), {
            otp,
            expires: now + 15 * 60 * 1000,
            attempts: 1,
            lastSent: now,
            type,
        });
    }
    async verifyStoredOtp(email, token) {
        const stored = this.otpStore.get(email.toLowerCase());
        if (!stored || stored.expires < Date.now()) {
            return false;
        }
        const isValid = stored.otp === token;
        if (isValid) {
            this.otpStore.delete(email.toLowerCase());
        }
        return isValid;
    }
    async signup(dto) {
        logger_util_1.default.info('Signup attempt', { username: dto.username });
        if (!this.validateEmail(dto.email)) {
            logger_util_1.default.warn('Signup failed: Invalid email format', {});
            throw new common_1.BadRequestException('Invalid email format. Please use a valid email address (e.g., user@example.com).');
        }
        const usernameValidation = this.validateUsername(dto.username);
        if (!usernameValidation.isValid) {
            throw new common_1.BadRequestException(usernameValidation.message);
        }
        const passwordValidation = this.validatePassword(dto.password);
        if (!passwordValidation.isValid) {
            throw new common_1.BadRequestException(passwordValidation.message);
        }
        try {
            const { data: existing, error: checkError } = await this.admin
                .from('user_profiles')
                .select('id')
                .eq('username', dto.username)
                .single();
            if (checkError && checkError.code !== 'PGRST116') {
                logger_util_1.default.error('Database error during username check', {
                    error: checkError,
                });
            }
            if (existing) {
                logger_util_1.default.warn('Signup failed: Username taken', {
                    username: dto.username,
                });
                throw new common_1.ConflictException('Username already taken. Please choose a different username.');
            }
        }
        catch (error) {
            if (error instanceof common_1.ConflictException) {
                throw error;
            }
            logger_util_1.default.warn('Username check had issues, but continuing with registration', { error });
        }
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email: dto.email,
                password: dto.password,
                options: {
                    data: { username: dto.username },
                },
            });
            if (error) {
                logger_util_1.default.warn('Signup failed via Supabase', {
                    error: error.message,
                    errorCode: error.code,
                });
                if (error.message.includes('invalid email') ||
                    error.message.includes('Email address')) {
                    throw new common_1.BadRequestException('Please use a valid email address format (e.g., user@example.com)');
                }
                else if (error.message.includes('already registered') ||
                    error.message.includes('user_exists')) {
                    throw new common_1.ConflictException('An account with this email already exists. Please try logging in instead.');
                }
                else if (error.message.includes('password') ||
                    error.message.includes('weak_password')) {
                    throw new common_1.BadRequestException('Password does not meet security requirements. Please choose a stronger password.');
                }
                else if (error.message.includes('rate limit')) {
                    throw new common_1.BadRequestException('Too many registration attempts. Please try again in a few minutes.');
                }
                else if (error.message.includes('fetch failed') ||
                    error.message.includes('SocketError')) {
                    throw new common_1.InternalServerErrorException('Authentication service is temporarily unavailable. Please try again in a moment.');
                }
                else {
                    throw new common_1.BadRequestException(`Registration failed: ${error.message}`);
                }
            }
            if (!data.user) {
                logger_util_1.default.error('Signup failed: No user returned from Supabase', {});
                throw new common_1.BadRequestException('Registration failed - please try again');
            }
            const emailLower = dto.email.toLowerCase();
            const otp = this.generateOtp();
            await this.storeOtp(emailLower, otp, 'signup');
            let profileCreated = false;
            try {
                [profileCreated] = await Promise.all([
                    this.createProfile(data.user.id, dto.username, emailLower, dto.avatar),
                    this.emailService.sendOtpEmail(dto.email, otp, dto.username),
                ]);
            }
            catch (profileError) {
                logger_util_1.default.error('Profile creation or email sending failed', {
                    userId: data.user.id,
                    error: profileError instanceof Error
                        ? profileError.message
                        : String(profileError),
                });
            }
            if (!profileCreated) {
                logger_util_1.default.warn('Profile creation failed during signup, will retry on OTP verify', {
                    userId: data.user.id,
                    username: dto.username,
                });
            }
            logger_util_1.default.info('Signup successful - OTP sent', {
                userId: data.user.id,
                username: dto.username,
                profileCreated,
            });
            return {
                message: 'Registration successful! Please check your email for the verification code.',
                userId: data.user.id,
                email: data.user.email,
                requiresOtpVerification: true,
                profileCreated,
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException ||
                error instanceof common_1.ConflictException ||
                error instanceof common_1.InternalServerErrorException) {
                throw error;
            }
            logger_util_1.default.error('Unexpected error during signup', {
                error,
            });
            throw new common_1.InternalServerErrorException('Registration failed due to an unexpected error');
        }
    }
    async login(dto) {
        logger_util_1.default.info('Login attempt', {});
        if (!this.validateEmail(dto.email)) {
            throw new common_1.BadRequestException('Invalid email format. Please use a valid email address.');
        }
        const passwordValidation = this.validatePassword(dto.password);
        if (!passwordValidation.isValid) {
            throw new common_1.BadRequestException('Invalid password format');
        }
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: dto.email,
                password: dto.password,
            });
            if (error) {
                logger_util_1.default.warn('Login failed', {
                    error: error.message,
                    errorCode: error.code,
                });
                if (error.message.includes('Invalid login credentials')) {
                    throw new common_1.UnauthorizedException('Invalid email or password. Please check your credentials and try again.');
                }
                else if (error.message.includes('Email not confirmed')) {
                    throw new common_1.UnauthorizedException('Please confirm your email address before logging in. Check your inbox for the confirmation link.');
                }
                else if (error.message.includes('rate limit')) {
                    throw new common_1.UnauthorizedException('Too many login attempts. Please try again in a few minutes.');
                }
                else if (error.message.includes('user_not_found')) {
                    throw new common_1.UnauthorizedException('No account found with this email. Please sign up first.');
                }
                else if (error.message.includes('fetch failed') ||
                    error.message.includes('SocketError')) {
                    throw new common_1.InternalServerErrorException('Authentication service is temporarily unavailable. Please try again in a moment.');
                }
                else {
                    throw new common_1.UnauthorizedException(`Login failed: ${error.message}`);
                }
            }
            if (!data.session) {
                logger_util_1.default.warn('Login failed: No session created', {});
                throw new common_1.UnauthorizedException('Login failed - unable to create session');
            }
            if (!data.user) {
                logger_util_1.default.warn('Login failed: No user data returned', {});
                throw new common_1.UnauthorizedException('Login failed - user data missing');
            }
            let hasCompletedOnboarding = false;
            let isDeactivated = false;
            let userRole = 'user';
            let username = '';
            try {
                const { data: profile } = await this.admin
                    .from('user_profiles')
                    .select('id, username, role, has_completed_onboarding, is_deactivated, is_suspended, is_deleted')
                    .eq('id', data.user.id)
                    .single();
                if (profile) {
                    if (profile.is_suspended) {
                        logger_util_1.default.warn('Login attempt for suspended account', {
                            userId: data.user.id,
                        });
                        throw new common_1.UnauthorizedException('Your account has been suspended. Please contact support for assistance.');
                    }
                    if (profile.is_deleted) {
                        logger_util_1.default.warn('Login attempt for deleted account', {
                            userId: data.user.id,
                        });
                        throw new common_1.UnauthorizedException('This account has been deleted. Please contact support if you believe this is an error.');
                    }
                    hasCompletedOnboarding = !!profile.has_completed_onboarding;
                    isDeactivated = !!profile.is_deactivated;
                    userRole = profile.role || 'user';
                    username = profile.username || '';
                }
                else {
                    logger_util_1.default.warn('Login attempt for user without profile — must sign up first', {
                        userId: data.user.id,
                    });
                    throw new common_1.UnauthorizedException('No profile found. Please sign up first.');
                }
            }
            catch (err) {
                if (err instanceof common_1.UnauthorizedException)
                    throw err;
                logger_util_1.default.error('Could not fetch profile during login', {
                    userId: data.user.id,
                    error: err?.message,
                });
                throw new common_1.UnauthorizedException('No profile found. Please sign up first.');
            }
            const tokens = this.generateTokens(data.user.id, data.user.email);
            let adminPermissions = undefined;
            if (userRole === 'admin') {
                adminPermissions = await this.fetchAdminPermissions(data.user.id);
            }
            else if (userRole === 'super_admin') {
                adminPermissions = null;
            }
            logger_util_1.default.info('Login successful', {
                userId: data.user.id,
                role: userRole,
                hasCompletedOnboarding,
            });
            return {
                ...tokens,
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    username: username,
                    role: userRole,
                    has_completed_onboarding: hasCompletedOnboarding,
                    is_deactivated: isDeactivated,
                    ...(adminPermissions !== undefined && { permissions: adminPermissions }),
                },
            };
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException ||
                error instanceof common_1.BadRequestException ||
                error instanceof common_1.InternalServerErrorException) {
                throw error;
            }
            logger_util_1.default.error('Unexpected error during login', {
                error,
            });
            throw new common_1.InternalServerErrorException('Login service temporarily unavailable');
        }
    }
    async socialLogin(provider) {
        logger_util_1.default.info('Social login initiated', { provider });
        if (!['google', 'facebook'].includes(provider)) {
            throw new common_1.BadRequestException('Unsupported social login provider');
        }
        try {
            const redirectTo = `${this.config.get('FRONTEND_URL')}/auth/callback`;
            const { data, error } = await this.supabase.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo,
                    skipBrowserRedirect: false,
                },
            });
            if (error) {
                logger_util_1.default.warn('Social login failed', { provider, error: error.message });
                throw new common_1.BadRequestException(`Social login with ${provider} failed: ${error.message}`);
            }
            if (!data.url) {
                logger_util_1.default.error('Social login URL not generated', { provider });
                throw new common_1.BadRequestException('Social login service temporarily unavailable');
            }
            logger_util_1.default.info('Social login URL generated', { provider, url: data.url });
            return {
                url: data.url,
                provider,
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            logger_util_1.default.error('Unexpected error during social login', { error, provider });
            throw new common_1.InternalServerErrorException('Social login service temporarily unavailable');
        }
    }
    async forgotPassword(dto) {
        logger_util_1.default.info('Password reset requested', {});
        if (!this.validateEmail(dto.email)) {
            throw new common_1.BadRequestException('Invalid email format');
        }
        try {
            const { data: profile } = await this.admin
                .from('user_profiles')
                .select('id, username')
                .eq('email', dto.email)
                .single();
            if (!profile) {
                logger_util_1.default.info('Password reset requested for non-existent email', {});
                return {
                    message: 'If an account exists with this email, a password reset link has been sent. Please check your inbox and spam folder.',
                };
            }
            const resetOtp = this.generateOtp();
            const now = Date.now();
            this.otpStore.set(dto.email, {
                otp: resetOtp,
                expires: now + 15 * 60 * 1000,
                attempts: 1,
                lastSent: now,
                type: 'password_reset',
            });
            const username = profile.username || 'User';
            await this.emailService.sendPasswordResetOtpEmail(dto.email, resetOtp, username);
            logger_util_1.default.info('Password reset OTP sent successfully', {
                userId: profile.id,
            });
            return {
                message: 'If an account exists with this email, a password reset code has been sent. Please check your inbox.',
                method: 'otp',
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            logger_util_1.default.error('Unexpected error during password reset request', {
                error,
            });
            throw new common_1.InternalServerErrorException('Password reset service temporarily unavailable');
        }
    }
    async resetPasswordWithOtp(dto) {
        logger_util_1.default.info('Password reset with OTP attempt', {
            hasOtp: !!dto.otp,
        });
        const passwordValidation = this.validatePassword(dto.password);
        if (!passwordValidation.isValid) {
            throw new common_1.BadRequestException(passwordValidation.message);
        }
        if (!dto.otp) {
            throw new common_1.BadRequestException('OTP code is required');
        }
        try {
            const stored = this.otpStore.get(dto.email);
            if (!stored ||
                stored.expires < Date.now() ||
                stored.otp !== dto.otp ||
                stored.type !== 'password_reset') {
                throw new common_1.BadRequestException('Invalid or expired OTP code');
            }
            const { data: profile } = await this.admin
                .from('user_profiles')
                .select('id, username')
                .eq('email', dto.email)
                .single();
            if (!profile) {
                throw new common_1.BadRequestException('User not found');
            }
            const { data, error } = await this.admin.auth.admin.updateUserById(profile.id, { password: dto.password });
            if (error) {
                logger_util_1.default.warn('Password reset failed', {
                    userId: profile.id,
                    error: error.message,
                    errorCode: error.code,
                });
                if (error.message.includes('password')) {
                    throw new common_1.BadRequestException('Password does not meet security requirements. Please choose a stronger password.');
                }
                else {
                    throw new common_1.BadRequestException(`Password reset failed: ${error.message}`);
                }
            }
            this.otpStore.delete(dto.email);
            try {
                const username = profile.username || 'User';
                await this.emailService.sendPasswordResetConfirmation(dto.email, username);
            }
            catch (emailError) {
                logger_util_1.default.warn('Password reset confirmation email failed, but password was reset', {
                    userId: profile.id,
                    error: emailError instanceof Error
                        ? emailError.message
                        : String(emailError),
                });
            }
            logger_util_1.default.info('Password reset with OTP successful', {
                userId: profile.id,
            });
            return {
                message: 'Password has been reset successfully. You can now log in with your new password.',
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            logger_util_1.default.error('Unexpected error during password reset with OTP', {
                error,
            });
            throw new common_1.InternalServerErrorException('Password reset service temporarily unavailable');
        }
    }
    async refresh(dto) {
        logger_util_1.default.info('Token refresh attempt');
        if (!dto.refreshToken) {
            throw new common_1.BadRequestException('Refresh token is required');
        }
        try {
            const payload = this.jwt.verify(dto.refreshToken, {
                secret: this.config.get('JWT_REFRESH_SECRET'),
            });
            const { data: { user }, error: userError, } = await this.supabase.auth.getUser();
            if (userError || !user) {
                logger_util_1.default.warn('User not found during token refresh', {
                    error: userError?.message,
                });
                throw new common_1.UnauthorizedException('User account no longer exists');
            }
            const tokens = this.generateTokens(user.id, user.email);
            logger_util_1.default.info('Token refresh successful', { userId: payload.sub });
            return tokens;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_util_1.default.warn('Invalid refresh token', { error: message });
            if (message.includes('jwt expired')) {
                throw new common_1.UnauthorizedException('Refresh token has expired. Please log in again.');
            }
            else if (message.includes('jwt malformed') ||
                message.includes('invalid signature')) {
                throw new common_1.UnauthorizedException('Invalid refresh token.');
            }
            else {
                throw new common_1.UnauthorizedException('Token refresh failed. Please log in again.');
            }
        }
    }
    async logout(userId) {
        logger_util_1.default.info('Logout initiated', { userId });
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) {
                logger_util_1.default.warn('Logout error from Supabase', {
                    userId,
                    error: error.message,
                });
            }
            logger_util_1.default.info('Logout successful', { userId });
            return {
                message: 'Logged out successfully',
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            logger_util_1.default.error('Unexpected error during logout', { error, userId });
            return {
                message: 'Logged out successfully',
                timestamp: new Date().toISOString(),
            };
        }
    }
    async sendOtp(dto) {
        logger_util_1.default.info('OTP send request', {});
        if (!this.validateEmail(dto.email)) {
            throw new common_1.BadRequestException('Invalid email format. Please use a valid email address.');
        }
        try {
            const { data, error } = await this.supabase.auth.signInWithOtp({
                email: dto.email,
                options: {
                    emailRedirectTo: `${this.config.get('FRONTEND_URL')}/auth/callback`,
                },
            });
            if (error) {
                logger_util_1.default.warn('OTP send failed', {
                    error: error.message,
                });
                if (error.message.includes('rate limit')) {
                    throw new common_1.BadRequestException('Too many OTP requests. Please try again in a few minutes.');
                }
                else {
                    throw new common_1.BadRequestException(`OTP send failed: ${error.message}`);
                }
            }
            logger_util_1.default.info('OTP sent successfully', {});
            return {
                message: 'One-time password has been sent to your email. Please check your inbox.',
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            logger_util_1.default.error('Unexpected error during OTP send', {
                error,
            });
            throw new common_1.InternalServerErrorException('OTP service temporarily unavailable');
        }
    }
    async resendOtp(dto) {
        logger_util_1.default.info('Resend OTP request', {});
        if (!this.validateEmail(dto.email)) {
            throw new common_1.BadRequestException('Invalid email format.');
        }
        const email = dto.email.toLowerCase();
        const now = Date.now();
        const existing = this.otpStore.get(email);
        if (existing) {
            if (existing.attempts >= this.MAX_OTP_ATTEMPTS) {
                const timeLeft = this.OTP_COOLDOWN_MS - (now - existing.lastSent);
                if (timeLeft > 0) {
                    const minutes = Math.ceil(timeLeft / 1000 / 60);
                    throw new common_1.BadRequestException(`Too many attempts. Try again in ${minutes} minute(s).`);
                }
                existing.attempts = 0;
            }
            if (now - existing.lastSent < 30000) {
                throw new common_1.BadRequestException('Please wait 30 seconds.');
            }
        }
        const { data: profile } = await this.admin
            .from('user_profiles')
            .select('id, username')
            .eq('email', email)
            .single();
        let isEmailConfirmed = false;
        if (profile) {
            try {
                const { data: authUser } = await this.admin.auth.admin.getUserById(profile.id);
                isEmailConfirmed = !!authUser.user?.email_confirmed_at;
            }
            catch (e) {
            }
        }
        if (isEmailConfirmed && !this.otpStore.has(email)) {
            throw new common_1.BadRequestException('Email is already verified. Please log in.');
        }
        const otp = this.generateOtp();
        this.otpStore.set(email, {
            otp,
            expires: now + 15 * 60 * 1000,
            attempts: (existing?.attempts || 0) + 1,
            lastSent: now,
            type: 'signup',
        });
        const username = profile?.username || 'User';
        await this.emailService.sendOtpEmail(dto.email, otp, username);
        return {
            message: 'A new code has been sent to your email.',
            attemptsRemaining: this.MAX_OTP_ATTEMPTS - ((existing?.attempts || 0) + 1),
        };
    }
    async verifyOtp(email, token) {
        logger_util_1.default.info('OTP verification attempt', {});
        if (!this.validateEmail(email))
            throw new common_1.BadRequestException('Invalid email format');
        if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
            throw new common_1.BadRequestException('Invalid OTP code');
        }
        const emailLower = email.toLowerCase();
        const isValid = await this.verifyStoredOtp(emailLower, token);
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid or expired code');
        }
        let { data: profile } = await this.admin
            .from('user_profiles')
            .select('id, username')
            .eq('email', emailLower)
            .single();
        if (!profile) {
            logger_util_1.default.warn('Profile not found by email during OTP verify, looking up auth user', {});
            const { data: authUsers } = await this.admin.auth.admin.listUsers();
            const authUser = authUsers?.users?.find((u) => u.email?.toLowerCase() === emailLower);
            if (!authUser) {
                throw new common_1.UnauthorizedException('User not found');
            }
            const username = authUser.user_metadata?.username || this.generateUsername();
            const created = await this.createProfile(authUser.id, username, emailLower);
            if (!created) {
                logger_util_1.default.error('Failed to auto-create profile during OTP verify', {
                    userId: authUser.id,
                });
                throw new common_1.UnauthorizedException('User not found');
            }
            const { data: newProfile } = await this.admin
                .from('user_profiles')
                .select('id, username')
                .eq('id', authUser.id)
                .single();
            if (!newProfile) {
                throw new common_1.UnauthorizedException('User not found');
            }
            profile = newProfile;
            logger_util_1.default.info('Auto-created missing profile during OTP verify', {
                userId: profile.id,
            });
        }
        await Promise.all([
            this.admin.auth.admin.updateUserById(profile.id, {
                email_confirm: true,
            }),
            this.emailService.sendWelcomeEmail(email, profile.username || 'User'),
        ]);
        return this.generateTokens(profile.id, email);
    }
    async completeOnboarding(userId, data) {
        return await this.onboardingService.saveOnboardingData(userId, data);
    }
    async getOnboardingStatus(userId) {
        return await this.onboardingService.getOnboardingStatus(userId);
    }
    async getCurrentUser(userId) {
        logger_util_1.default.info('Fetching current user', { userId });
        try {
            const { data: profile, error } = await this.admin
                .from('user_profiles')
                .select(`
        id,
        username,
        email,
        first_name_encrypted,
        last_name_encrypted,
        avatar,
        bio,
        job_title,
        location,
        years_experience,
        skills,
        linkedin_url,
        privacy_level,
        is_willing_to_mentor,
        has_completed_onboarding,
        reputation_score,
        total_posts,
        total_comments,
        helpful_votes_received,
        mentorship_sessions_completed,
        successful_referrals,
        created_at,
        updated_at,
        last_active_at,
        company_type,
        race_encrypted,
        role,
        gender_encrypted,
        career_level_encrypted,
        company_encrypted,
        affinity_tags_encrypted
      `)
                .eq('id', userId)
                .single();
            if (error || !profile) {
                logger_util_1.default.warn('User profile not found — must sign up first', { userId });
                throw new common_1.UnauthorizedException('User profile not found. Please sign up first.');
            }
            const userData = this.cleanUserData(profile);
            if (profile.role === 'admin') {
                userData.permissions = await this.fetchAdminPermissions(userId);
            }
            else if (profile.role === 'super_admin') {
                userData.permissions = null;
            }
            return userData;
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException)
                throw error;
            logger_util_1.default.error('Failed to fetch user profile', { userId, error });
            throw new common_1.InternalServerErrorException('Unable to fetch user profile');
        }
    }
    async updateProfile(userId, updateData) {
        logger_util_1.default.info('Updating user profile', { userId });
        const allowedFields = {
            avatar: updateData.avatar,
            bio: updateData.bio,
            job_title: updateData.job_title,
            location: updateData.location,
            years_experience: updateData.years_experience,
            skills: updateData.skills,
            linkedin_url: updateData.linkedin_url,
            is_willing_to_mentor: updateData.is_willing_to_mentor,
            privacy_level: updateData.privacy_level,
            company_encrypted: updateData.company_encrypted,
            career_level_encrypted: updateData.career_level_encrypted,
            race_encrypted: updateData.race_encrypted,
            gender_encrypted: updateData.gender_encrypted,
            affinity_tags_encrypted: updateData.affinity_tags_encrypted,
        };
        const cleanedUpdate = Object.fromEntries(Object.entries(allowedFields).filter(([_, v]) => v !== undefined));
        if (Object.keys(cleanedUpdate).length === 0) {
            throw new common_1.BadRequestException('No valid fields provided to update');
        }
        try {
            const { data, error } = await this.admin
                .from('user_profiles')
                .update({
                ...cleanedUpdate,
                updated_at: new Date().toISOString(),
                last_active_at: new Date().toISOString(),
            })
                .eq('id', userId)
                .select()
                .single();
            if (error) {
                logger_util_1.default.error('Profile update failed in DB', {
                    userId,
                    error: error.message,
                });
                throw new common_1.BadRequestException('Failed to update profile');
            }
            logger_util_1.default.info('Profile updated successfully', { userId });
            return this.cleanUserData(data);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException)
                throw error;
            logger_util_1.default.error('Unexpected error during profile update', { userId, error });
            throw new common_1.InternalServerErrorException('Profile update failed');
        }
    }
    async changePassword(userId, currentPassword, newPassword) {
        logger_util_1.default.info('Changing password', { userId });
        const passwordValidation = this.validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            throw new common_1.BadRequestException(passwordValidation.message);
        }
        try {
            const { data: { user }, error: userError, } = await this.supabase.auth.getUser();
            if (userError || !user) {
                logger_util_1.default.error('User not found in Supabase Auth during password change', {
                    userId,
                    error: userError?.message,
                });
                throw new common_1.BadRequestException('User not found');
            }
            const userEmail = user.email;
            if (!userEmail) {
                throw new common_1.BadRequestException('User email not found');
            }
            const { error: signInError } = await this.supabase.auth.signInWithPassword({
                email: userEmail,
                password: currentPassword,
            });
            if (signInError) {
                logger_util_1.default.warn('Current password verification failed', {
                    userId,
                    error: signInError.message,
                });
                throw new common_1.BadRequestException('Current password is incorrect');
            }
            const { error } = await this.supabase.auth.updateUser({
                password: newPassword,
            });
            if (error) {
                logger_util_1.default.warn('Password change failed', {
                    userId,
                    error: error.message,
                    errorCode: error.code,
                });
                if (error.message.includes('password')) {
                    throw new common_1.BadRequestException('Password does not meet security requirements. Please choose a stronger password.');
                }
                else {
                    throw new common_1.BadRequestException(`Password change failed: ${error.message}`);
                }
            }
            logger_util_1.default.info('Password changed successfully', { userId });
            return { message: 'Password changed successfully' };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            logger_util_1.default.error('Unexpected error during password change', {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new common_1.InternalServerErrorException('Password change service temporarily unavailable');
        }
    }
    async fetchAdminPermissions(userId) {
        try {
            const { data } = await this.admin
                .from('admin_permissions')
                .select('permissions')
                .eq('admin_id', userId)
                .maybeSingle();
            return data?.permissions ?? [];
        }
        catch {
            return [];
        }
    }
    generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    cleanUserData(profile) {
        const p = profile;
        return {
            id: p.id,
            username: p.username,
            email: p.email,
            first_name: p.first_name_encrypted ?? null,
            last_name: p.last_name_encrypted ?? null,
            avatar: p.avatar ?? null,
            bio: p.bio ?? null,
            job_title: p.job_title ?? null,
            location: p.location ?? null,
            years_experience: p.years_experience ?? null,
            skills: p.skills || [],
            linkedin_url: p.linkedin_url ?? null,
            privacy_level: p.privacy_level,
            role: p.role || 'user',
            is_willing_to_mentor: !!p.is_willing_to_mentor,
            has_completed_onboarding: !!p.has_completed_onboarding,
            reputation_score: p.reputation_score || 0,
            total_posts: p.total_posts || 0,
            total_comments: p.total_comments || 0,
            helpful_votes_received: p.helpful_votes_received || 0,
            mentorship_sessions_completed: p.mentorship_sessions_completed || 0,
            successful_referrals: p.successful_referrals || 0,
            created_at: p.created_at,
            updated_at: p.updated_at,
            last_active_at: p.last_active_at,
            company_type: p.company_type,
            race_encrypted: p.race_encrypted,
            gender_encrypted: p.gender_encrypted,
            career_level_encrypted: p.career_level_encrypted,
            company_encrypted: p.company_encrypted,
            affinity_tags_encrypted: p.affinity_tags_encrypted,
        };
    }
    async createProfile(userId, username, email, avatar) {
        logger_util_1.default.info('Creating user profile', { userId, username });
        const profileData = {
            id: userId,
            username,
            email,
            avatar: avatar || 'User',
            privacy_level: 'anonymous',
            has_completed_onboarding: false,
            is_willing_to_mentor: false,
            race_encrypted: null,
            gender_encrypted: null,
            career_level_encrypted: null,
            company_encrypted: null,
            affinity_tags_encrypted: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
        };
        const { error } = await this.admin
            .from('user_profiles')
            .insert(profileData);
        if (error) {
            if (error.code === '23505') {
                logger_util_1.default.warn('Username already taken, generating new one', {
                    userId,
                    username,
                });
                const uniqueUsername = this.generateUniqueUsername(username);
                return this.createProfileWithUniqueUsername(userId, uniqueUsername, email, avatar);
            }
            logger_util_1.default.error('Failed to create profile', {
                userId,
                username,
                errorCode: error.code,
                errorMessage: error.message,
            });
            return false;
        }
        logger_util_1.default.info('Profile created successfully', { userId, username });
        return true;
    }
    async createProfileWithUniqueUsername(userId, username, email, avatar) {
        const { error } = await this.admin.from('user_profiles').insert({
            id: userId,
            username,
            email,
            avatar: avatar || 'User',
            privacy_level: 'anonymous',
            has_completed_onboarding: false,
            is_willing_to_mentor: false,
            race_encrypted: null,
            gender_encrypted: null,
            career_level_encrypted: null,
            company_encrypted: null,
            affinity_tags_encrypted: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
        });
        if (error) {
            logger_util_1.default.error('Failed to create profile with unique username', {
                userId,
                username,
                error: error.message,
            });
            return false;
        }
        logger_util_1.default.info('Profile created with unique username', { userId, username });
        return true;
    }
    async ensureProfileExists(userId, email) {
        logger_util_1.default.info('Ensuring profile exists', { userId });
        try {
            const { data: profile, error } = await this.admin
                .from('user_profiles')
                .select('id, username, email')
                .eq('id', userId)
                .single();
            if (error && error.code !== 'PGRST116') {
                logger_util_1.default.error('Profile check failed', {
                    userId,
                    error: error.message,
                });
            }
            if (!profile) {
                const username = this.generateUsername();
                const profileCreated = await this.createProfile(userId, username, email);
                logger_util_1.default.info('Auto-created profile during login', {
                    userId,
                    username,
                    profileCreated,
                });
                return profileCreated;
            }
            else {
                if (!profile.email) {
                    await this.updateProfileEmail(userId, email);
                }
                logger_util_1.default.info('Profile already exists', {
                    userId,
                    username: profile.username,
                });
                return true;
            }
        }
        catch (error) {
            logger_util_1.default.error('Unexpected error during profile check', {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }
    async updateProfileEmail(userId, email) {
        try {
            const { error } = await this.admin
                .from('user_profiles')
                .update({ email, updated_at: new Date().toISOString() })
                .eq('id', userId);
            if (error) {
                logger_util_1.default.error('Failed to update profile email', {
                    userId,
                    error: error.message,
                });
            }
            else {
                logger_util_1.default.info('Updated profile email', { userId });
            }
        }
        catch (error) {
            logger_util_1.default.error('Unexpected error updating profile email', {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    generateUniqueUsername(baseUsername) {
        const timestamp = Date.now().toString().slice(-6);
        const randomSuffix = Math.floor(Math.random() * 1000);
        return `${baseUsername}_${timestamp}${randomSuffix}`.slice(0, 50);
    }
    generateUsername() {
        const adj = [
            'Brave',
            'Quiet',
            'Rising',
            'Future',
            'Bold',
            'Smart',
            'True',
            'Next',
        ];
        const noun = [
            'Leader',
            'Voice',
            'Pro',
            'Dev',
            'Builder',
            'King',
            'Queen',
            'Star',
        ];
        const num = Math.floor(Math.random() * 9999);
        const username = `${adj[Math.floor(Math.random() * adj.length)]}${noun[Math.floor(Math.random() * noun.length)]}${num}`;
        logger_util_1.default.info('Generated username', { username });
        return username;
    }
    generateTokens(userId, email) {
        try {
            const accessTokenExpiresIn = '365d';
            const refreshTokenExpiresIn = '7d';
            const accessToken = this.jwt.sign({ sub: userId, email }, {
                secret: this.config.get('JWT_SECRET'),
                expiresIn: accessTokenExpiresIn,
            });
            const refreshToken = this.jwt.sign({ sub: userId, email }, {
                secret: this.config.get('JWT_REFRESH_SECRET'),
                expiresIn: refreshTokenExpiresIn,
            });
            const expiresInSeconds = 24 * 60 * 60;
            logger_util_1.default.info('Tokens generated successfully', { userId });
            return {
                access_token: accessToken,
                refresh_token: refreshToken,
                token_type: 'Bearer',
                expires_in: expiresInSeconds,
                user: {
                    id: userId,
                    email: email,
                },
            };
        }
        catch (error) {
            logger_util_1.default.error('Token generation failed', {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new common_1.InternalServerErrorException('Authentication service temporarily unavailable');
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        jwt_1.JwtService,
        encryption_util_1.EncryptionUtil,
        email_service_1.EmailService,
        onboarding_service_1.OnboardingService])
], AuthService);
//# sourceMappingURL=auth.service.js.map