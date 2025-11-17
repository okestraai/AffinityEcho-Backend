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
const logger_util_1 = __importDefault(require("../../../common/utils/logger.util"));
let AuthService = class AuthService {
    constructor(config, jwt, encryption) {
        this.config = config;
        this.jwt = jwt;
        this.encryption = encryption;
        this.supabase = (0, supabase_client_1.supabaseClient)(config);
        this.admin = (0, supabase_client_1.supabaseAdmin)(config);
    }
    async signup(dto) {
        logger_util_1.default.info('Signup attempt', { email: dto.email, username: dto.username });
        const { data: existing, error: checkError } = await this.supabase
            .from('user_profiles')
            .select('id')
            .eq('username', dto.username)
            .single();
        if (checkError && checkError.code !== 'PGRST116') {
            logger_util_1.default.error('Database error during username check', { error: checkError });
        }
        if (existing) {
            logger_util_1.default.warn('Signup failed: Username taken', { username: dto.username });
            throw new common_1.ConflictException('Username taken');
        }
        const { data, error } = await this.supabase.auth.signUp({
            email: dto.email,
            password: dto.password,
            options: { data: { username: dto.username } },
        });
        if (error) {
            logger_util_1.default.warn('Signup failed via Supabase', { email: dto.email, error: error.message });
            throw new common_1.BadRequestException(error.message);
        }
        if (!data.user) {
            logger_util_1.default.error('Signup failed: No user returned', { email: dto.email });
            throw new common_1.BadRequestException('Signup failed');
        }
        await this.createProfile(data.user.id, dto.username);
        logger_util_1.default.info('Signup successful', { userId: data.user.id, email: dto.email });
        return { message: 'Check email for confirmation' };
    }
    async login(dto) {
        logger_util_1.default.info('Login attempt', { email: dto.email });
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: dto.email,
            password: dto.password,
        });
        if (error || !data.session) {
            logger_util_1.default.warn('Login failed: Invalid credentials', { email: dto.email });
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        logger_util_1.default.info('Login successful', { userId: data.user.id, email: data.user.email });
        return this.generateTokens(data.user.id, data.user.email);
    }
    async socialLogin(provider) {
        logger_util_1.default.info('Social login initiated', { provider });
        const redirectTo = `${this.config.get('FRONTEND_URL')}/auth/callback`;
        const { data, error } = await this.supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo },
        });
        if (error) {
            logger_util_1.default.warn('Social login failed', { provider, error: error.message });
            throw new common_1.BadRequestException(error.message);
        }
        logger_util_1.default.info('Social login URL generated', { provider, url: data.url });
        return { url: data.url };
    }
    async forgotPassword(email) {
        logger_util_1.default.info('Password reset requested', { email });
        const { data, error } = await this.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${this.config.get('FRONTEND_URL')}/reset-password`,
        });
        if (error) {
            logger_util_1.default.warn('Password reset email failed', { email, error: error.message });
            throw new common_1.BadRequestException(error.message);
        }
        logger_util_1.default.info('Password reset link sent', { email });
        return { message: 'Reset link sent' };
    }
    async resetPassword(token, password) {
        logger_util_1.default.info('Password reset attempt', { hasToken: !!token });
        const { data, error } = await this.supabase.auth.updateUser({
            password,
        });
        if (error) {
            logger_util_1.default.warn('Password reset failed', { error: error.message });
            throw new common_1.BadRequestException(error.message);
        }
        logger_util_1.default.info('Password reset successful');
        return { message: 'Password reset successful' };
    }
    async refresh(refreshToken) {
        logger_util_1.default.info('Token refresh attempt');
        try {
            const payload = this.jwt.verify(refreshToken, {
                secret: this.config.get('JWT_REFRESH_SECRET'),
            });
            const accessToken = this.jwt.sign({ sub: payload.sub, email: payload.email }, { expiresIn: '15m' });
            logger_util_1.default.info('Token refreshed', { userId: payload.sub });
            return { access_token: accessToken };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_util_1.default.warn('Invalid refresh token', { error: message });
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
    }
    async logout(userId) {
        logger_util_1.default.info('Logout initiated', { userId });
        await this.supabase.auth.signOut();
        logger_util_1.default.info('Logout successful', { userId });
        return { message: 'Logged out' };
    }
    async createProfile(userId, username) {
        logger_util_1.default.info('Creating user profile', { userId, username });
        const { error } = await this.supabase.from('user_profiles').insert({
            id: userId,
            username,
            avatar: 'User',
            privacy_level: 'anonymous',
        });
        if (error) {
            logger_util_1.default.error('Failed to create profile', { userId, error: error.message });
            throw error;
        }
        logger_util_1.default.info('Profile created', { userId, username });
    }
    generateTokens(userId, email) {
        const accessToken = this.jwt.sign({ sub: userId, email }, { expiresIn: '15m' });
        const refreshToken = this.jwt.sign({ sub: userId, email }, {
            secret: this.config.get('JWT_REFRESH_SECRET'),
            expiresIn: '7d',
        });
        logger_util_1.default.info('Tokens generated', { userId, email });
        return { access_token: accessToken, refresh_token: refreshToken };
    }
    async sendOtp(email) {
        logger_util_1.default.info('OTP send request', { email });
        const { data, error } = await this.supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${this.config.get('FRONTEND_URL')}/auth/callback`,
            },
        });
        if (error) {
            logger_util_1.default.warn('OTP send failed', { email, error: error.message });
            throw new common_1.BadRequestException(error.message);
        }
        logger_util_1.default.info('OTP sent successfully', { email });
        return { message: `OTP sent to ${email}` };
    }
    async verifyOtp(email, token) {
        logger_util_1.default.info('OTP verification attempt', { email });
        const { data, error } = await this.supabase.auth.verifyOtp({
            email,
            token,
            type: 'email',
        });
        if (error || !data.session) {
            logger_util_1.default.warn('OTP verification failed', { email, error: error?.message });
            throw new common_1.UnauthorizedException('Invalid or expired OTP');
        }
        const user = data.user;
        if (!user) {
            logger_util_1.default.error('OTP verified but no user returned', { email });
            throw new common_1.UnauthorizedException('Invalid or expired OTP');
        }
        await this.ensureProfileExists(user.id, user.email);
        logger_util_1.default.info('OTP verified and login successful', { userId: user.id, email });
        return this.generateTokens(user.id, user.email);
    }
    async ensureProfileExists(userId, email) {
        logger_util_1.default.info('Ensuring profile exists', { userId, email });
        const { data: profile, error } = await this.supabase
            .from('user_profiles')
            .select('id')
            .eq('id', userId)
            .single();
        if (error && error.code !== 'PGRST116') {
            logger_util_1.default.error('Profile check failed', { userId, error: error.message });
        }
        if (!profile) {
            const username = this.generateUsername();
            await this.createProfile(userId, username);
            logger_util_1.default.info('Auto-created profile during OTP login', { userId, username });
        }
        else {
            logger_util_1.default.info('Profile already exists', { userId });
        }
    }
    generateUsername() {
        const adj = ['Brave', 'Quiet', 'Rising', 'Future', 'Bold', 'Smart', 'True', 'Next'];
        const noun = ['Leader', 'Voice', 'Pro', 'Dev', 'Builder', 'King', 'Queen', 'Star'];
        const num = Math.floor(Math.random() * 9999);
        const username = `${adj[Math.floor(Math.random() * adj.length)]}${noun[Math.floor(Math.random() * noun.length)]}${num}`;
        logger_util_1.default.info('Generated username', { username });
        return username;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        jwt_1.JwtService,
        encryption_util_1.EncryptionUtil])
], AuthService);
//# sourceMappingURL=auth.service.js.map