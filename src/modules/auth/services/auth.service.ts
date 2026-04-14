import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { supabaseAdmin } from '../../../database/supabase.client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { AvatarGenerator } from '../../../common/utils/avatar-generator.util';
import { EmailService } from '../../../common/utils/email/email.service';
import { SignupDto } from '../dto/signup.dto';
import { LoginDto } from '../dto/login.dto';
import { SendOtpDto } from '../dto/otp.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordWithOtpDto } from '../dto/reset-password.dto';
import { RefreshTokenDto } from '../dto/password.dto';
import { OnboardingDataDto } from '../dto/onboarding.dto';
import logger from '../../../common/utils/logger.util';
import { UserProfileResponse } from '../interfaces/user-profile.interface';
import { OnboardingService } from './onboarding.service';

@Injectable()
export class AuthService {
  private admin;
  // UPDATE THIS TYPE DEFINITION
  private otpStore: Map<
    string,
    {
      otp: string;
      expires: number;
      attempts: number;
      lastSent: number;
      type?: string; // ADD THIS - make it optional
    }
  >;
  private readonly MAX_OTP_ATTEMPTS = 3;
  private readonly OTP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private config: ConfigService,
    private jwt: JwtService,
    private encryption: EncryptionUtil,
    private emailService: EmailService,
    private onboardingService: OnboardingService,
  ) {
    this.admin = supabaseAdmin(config);
    this.otpStore = new Map();
  }

  // Validate email format before sending to Supabase
  private validateEmail(email: string): boolean {
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  // Validate password strength
  private validatePassword(password: string): {
    isValid: boolean;
    message?: string;
  } {
    if (!password || password.length < 8) {
      return {
        isValid: false,
        message: 'Password must be at least 8 characters long',
      };
    }
    return { isValid: true };
  }

  // Validate username
  private validateUsername(username: string): {
    isValid: boolean;
    message?: string;
  } {
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

  // ──────────────────────────────────────────────────────────────
  // FIXED: STORE OTP (case-insensitive + type)
  // ──────────────────────────────────────────────────────────────
  private async storeOtp(
    email: string,
    otp: string,
    type: 'signup' | 'password_reset' = 'signup',
  ): Promise<void> {
    const now = Date.now();
    this.otpStore.set(email.toLowerCase(), {
      otp,
      expires: now + 15 * 60 * 1000,
      attempts: 1,
      lastSent: now,
      type,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // FIXED: VERIFY OTP (only delete on success)
  // ──────────────────────────────────────────────────────────────
  private async verifyStoredOtp(
    email: string,
    token: string,
  ): Promise<boolean> {
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

  // EMAIL + PASSWORD SIGNUP
  async signup(dto: SignupDto) {
    logger.info('Signup attempt', { username: dto.username });

    // Validate inputs
    if (!this.validateEmail(dto.email)) {
      logger.warn('Signup failed: Invalid email format', {});
      throw new BadRequestException(
        'Invalid email format. Please use a valid email address (e.g., user@example.com).',
      );
    }

    const usernameValidation = this.validateUsername(dto.username);
    if (!usernameValidation.isValid) {
      throw new BadRequestException(usernameValidation.message);
    }

    const passwordValidation = this.validatePassword(dto.password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.message);
    }

    // Check if username already exists
    try {
      const { data: existing, error: checkError } = await this.admin
        .from('user_profiles')
        .select('id')
        .eq('username', dto.username)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        logger.error('Database error during username check', {
          error: checkError,
        });
      }

      if (existing) {
        logger.warn('Signup failed: Username taken', {
          username: dto.username,
        });
        throw new ConflictException(
          'Username already taken. Please choose a different username.',
        );
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      logger.warn(
        'Username check had issues, but continuing with registration',
        { error },
      );
    }

    // Create user with bcrypt + direct SQL
    try {
      const emailLower = dto.email.toLowerCase();

      // Check if email already exists
      const { data: existingUser } = await this.admin
        .from('user_profiles')
        .select('id')
        .eq('email', emailLower)
        .maybeSingle();

      if (existingUser) {
        throw new ConflictException(
          'An account with this email already exists. Please try logging in instead.',
        );
      }

      // Hash password
      const passwordHash = await bcrypt.hash(dto.password, 12);
      const userId = uuidv4();

      // Create profile with auth fields
      const otp = this.generateOtp();
      await this.storeOtp(emailLower, otp, 'signup');

      let profileCreated = false;
      try {
        [profileCreated] = await Promise.all([
          this.createProfile(
            userId,
            dto.username,
            emailLower,
            dto.avatar,
            passwordHash,
          ),
          this.emailService.sendOtpEmail(dto.email, otp, dto.username),
        ]);
      } catch (profileError) {
        logger.error('Profile creation or email sending failed', {
          userId,
          error:
            profileError instanceof Error
              ? profileError.message
              : String(profileError),
        });
      }

      if (!profileCreated) {
        logger.warn(
          'Profile creation failed during signup, will retry on OTP verify',
          { userId, username: dto.username },
        );
      }

      logger.info('Signup successful - OTP sent', {
        userId,
        username: dto.username,
        profileCreated,
      });

      return {
        message:
          'Registration successful! Please check your email for the verification code.',
        userId,
        email: emailLower,
        requiresOtpVerification: true,
        profileCreated,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      logger.error('Unexpected error during signup', {
        error,
      });
      throw new InternalServerErrorException(
        'Registration failed due to an unexpected error',
      );
    }
  }

  // EMAIL + PASSWORD LOGIN
  async login(dto: LoginDto) {
    logger.info('Login attempt', {});

    // Validate email format
    if (!this.validateEmail(dto.email)) {
      throw new BadRequestException(
        'Invalid email format. Please use a valid email address.',
      );
    }

    const passwordValidation = this.validatePassword(dto.password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException('Invalid password format');
    }

    try {
      // Look up user by email
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select(
          'id, email, password_hash, auth_provider, username, role, has_completed_onboarding, is_deactivated, is_suspended, is_deleted',
        )
        .eq('email', dto.email.toLowerCase())
        .maybeSingle();

      if (!user || userError) {
        logger.warn('Login failed: user not found', { email: dto.email });
        throw new UnauthorizedException(
          'Invalid email or password. Please check your credentials and try again.',
        );
      }

      if (user.auth_provider === 'google' && !user.password_hash) {
        throw new UnauthorizedException(
          'This account uses Google sign-in. Please log in with Google.',
        );
      }

      if (!user.password_hash) {
        throw new UnauthorizedException(
          'Invalid email or password. Please check your credentials and try again.',
        );
      }

      // Verify password
      const passwordValid = await bcrypt.compare(
        dto.password,
        user.password_hash,
      );
      if (!passwordValid) {
        logger.warn('Login failed: invalid password', {});
        throw new UnauthorizedException(
          'Invalid email or password. Please check your credentials and try again.',
        );
      }

      // Check account status (all fields already in the single query above)
      if (user.is_suspended) {
        logger.warn('Login attempt for suspended account', { userId: user.id });
        throw new UnauthorizedException(
          'Your account has been suspended. Please contact support for assistance.',
        );
      }
      if (user.is_deleted) {
        logger.warn('Login attempt for deleted account', { userId: user.id });
        throw new UnauthorizedException(
          'This account has been deleted. Please contact support if you believe this is an error.',
        );
      }

      const hasCompletedOnboarding = !!user.has_completed_onboarding;
      const isDeactivated = !!user.is_deactivated;
      const userRole = user.role || 'user';
      const username = user.username || '';

      const tokens = this.generateTokens(user.id, user.email);

      let adminPermissions: string[] | null | undefined = undefined;
      if (userRole === 'admin') {
        adminPermissions = await this.fetchAdminPermissions(user.id);
      } else if (userRole === 'super_admin') {
        adminPermissions = null;
      }

      logger.info('Login successful', {
        userId: user.id,
        role: userRole,
        hasCompletedOnboarding,
      });

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          username,
          role: userRole,
          has_completed_onboarding: hasCompletedOnboarding,
          is_deactivated: isDeactivated,
          ...(adminPermissions !== undefined && {
            permissions: adminPermissions,
          }),
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      logger.error('Unexpected error during login', {
        error,
      });
      throw new InternalServerErrorException(
        'Login service temporarily unavailable',
      );
    }
  }

  // SOCIAL LOGIN (GOOGLE / FACEBOOK)
  async socialLogin(provider: 'google' | 'facebook', redirectUri?: string) {
    logger.info('Social login initiated', { provider });

    if (!['google', 'facebook'].includes(provider)) {
      throw new BadRequestException('Unsupported social login provider');
    }

    // Validate redirect_uri if provided (only allow our deep link scheme)
    if (redirectUri && !redirectUri.startsWith('affinityecho://')) {
      throw new BadRequestException('Invalid redirect_uri');
    }

    try {
      const backendUrl =
        this.config.get('BACKEND_URL') ||
        `http://localhost:${this.config.get('PORT') || 3000}`;
      const clientId = this.config.get('GOOGLE_CLIENT_ID');
      if (!clientId) {
        throw new InternalServerErrorException('Google OAuth not configured');
      }

      // Keep redirect_uri clean — Google must match it exactly against the registered URI.
      // Carry the mobile deep link via the `state` param instead.
      const callbackUrl = `${backendUrl}/api/v1/auth/google/callback`;

      // Build Google OAuth URL directly
      const googleAuthUrl = new URL(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      googleAuthUrl.searchParams.set('client_id', clientId);
      googleAuthUrl.searchParams.set('redirect_uri', callbackUrl);
      googleAuthUrl.searchParams.set('response_type', 'code');
      googleAuthUrl.searchParams.set('scope', 'openid email profile');
      googleAuthUrl.searchParams.set('access_type', 'offline');
      googleAuthUrl.searchParams.set('prompt', 'consent');
      if (redirectUri) {
        googleAuthUrl.searchParams.set(
          'state',
          encodeURIComponent(redirectUri),
        );
      }

      const url = googleAuthUrl.toString();
      logger.info('Social login URL generated', { provider, url });
      return { url, provider };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      logger.error('Unexpected error during social login', { error, provider });
      throw new InternalServerErrorException(
        'Social login service temporarily unavailable',
      );
    }
  }

  // GOOGLE OAUTH CALLBACK
  async googleCallback(
    code: string,
    state?: string,
  ): Promise<{ redirectUrl: string }> {
    const frontendUrl = this.config.get('FRONTEND_URL');

    // Decode the mobile deep link from state param (set during socialLogin)
    let redirectUri: string | undefined;
    if (state) {
      try {
        const decoded = decodeURIComponent(state);
        if (decoded.startsWith('affinityecho://')) {
          redirectUri = decoded;
        }
      } catch {
        // invalid state — ignore
      }
    }

    if (!code) {
      const errorTarget = redirectUri || `${frontendUrl}/auth/callback`;
      return {
        redirectUrl: `${errorTarget}?error=${encodeURIComponent('Missing authorization code')}`,
      };
    }

    try {
      const { OAuth2Client } = await import('google-auth-library');
      const backendUrl =
        this.config.get('BACKEND_URL') ||
        `http://localhost:${this.config.get('PORT') || 3000}`;
      const callbackUrl = `${backendUrl}/api/v1/auth/google/callback`;

      const oauth2Client = new OAuth2Client(
        this.config.get('GOOGLE_CLIENT_ID'),
        this.config.get('GOOGLE_CLIENT_SECRET'),
        callbackUrl,
      );

      // Exchange code for tokens
      const { tokens: googleTokens } = await oauth2Client.getToken(code);
      const ticket = await oauth2Client.verifyIdToken({
        idToken: googleTokens.id_token!,
        audience: this.config.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        logger.error('Google OAuth: no email in token payload');
        return {
          redirectUrl: `${frontendUrl}/auth/callback?error=${encodeURIComponent('No email from Google')}`,
        };
      }

      const googleId = payload.sub;
      const email = payload.email.toLowerCase();

      // Check if user exists by google_id or email
      let { data: existingUser } = await this.admin
        .from('user_profiles')
        .select('id, email, google_id')
        .eq('google_id', googleId)
        .maybeSingle();

      if (!existingUser) {
        // Try by email
        const { data: emailUser } = await this.admin
          .from('user_profiles')
          .select('id, email, google_id')
          .eq('email', email)
          .maybeSingle();

        if (emailUser) {
          // Link Google account to existing email user
          await this.admin
            .from('user_profiles')
            .update({
              google_id: googleId,
              auth_provider: 'google',
              email_confirmed_at: new Date().toISOString(),
            })
            .eq('id', emailUser.id);
          existingUser = emailUser;
        }
      }

      if (!existingUser) {
        // New Google signup — create profile
        const userId = uuidv4();
        const username = this.generateUsername();
        const avatar = AvatarGenerator.generate(userId).emoji;

        await this.createProfile(
          userId,
          username,
          email,
          avatar,
          undefined,
          'google',
          googleId,
        );

        // Confirm email automatically for Google users
        await this.admin
          .from('user_profiles')
          .update({ email_confirmed_at: new Date().toISOString() })
          .eq('id', userId);

        existingUser = { id: userId, email };
      }

      // Generate app tokens
      const tokens = this.generateTokens(
        existingUser.id,
        existingUser.email || email,
      );

      const params = new URLSearchParams({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });

      const target = redirectUri || `${frontendUrl}/auth/callback`;
      logger.info('Google OAuth callback successful', {
        userId: existingUser.id,
        mobile: !!redirectUri,
      });
      return { redirectUrl: `${target}?${params.toString()}` };
    } catch (err) {
      logger.error('Google OAuth callback error', { error: err });
      const errorTarget = redirectUri || `${frontendUrl}/auth/callback`;
      return {
        redirectUrl: `${errorTarget}?error=${encodeURIComponent('Authentication failed')}`,
      };
    }
  }

  // ALTERNATIVE APPROACH - USE OTP FOR PASSWORD RESET
  async forgotPassword(dto: ForgotPasswordDto) {
    logger.info('Password reset requested', {});

    if (!this.validateEmail(dto.email)) {
      throw new BadRequestException('Invalid email format');
    }

    try {
      // OPTIMIZATION: Query user_profiles directly instead of listUsers()
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .eq('email', dto.email)
        .single();

      if (!profile) {
        // For security, don't reveal whether email exists
        logger.info('Password reset requested for non-existent email', {});
        return {
          message:
            'If an account exists with this email, a password reset link has been sent. Please check your inbox and spam folder.',
        };
      }

      // Generate OTP for password reset
      const resetOtp = this.generateOtp();

      // Store OTP with password reset type
      const now = Date.now();
      this.otpStore.set(dto.email, {
        otp: resetOtp,
        expires: now + 15 * 60 * 1000, // 15 minutes
        attempts: 1,
        lastSent: now,
        type: 'password_reset', // Mark as password reset OTP
      });

      // OPTIMIZATION: Already have username from the query above
      const username = profile.username || 'User';

      // Send custom password reset OTP email
      await this.emailService.sendPasswordResetOtpEmail(
        dto.email,
        resetOtp,
        username,
      );

      logger.info('Password reset OTP sent successfully', {
        userId: profile.id,
      });

      return {
        message:
          'If an account exists with this email, a password reset code has been sent. Please check your inbox.',
        method: 'otp',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during password reset request', {
        error,
      });
      throw new InternalServerErrorException(
        'Password reset service temporarily unavailable',
      );
    }
  }

  async resetPasswordWithOtp(dto: ResetPasswordWithOtpDto & { otp: string }) {
    logger.info('Password reset with OTP attempt', {
      hasOtp: !!dto.otp,
    });

    const passwordValidation = this.validatePassword(dto.password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.message);
    }

    if (!dto.otp) {
      throw new BadRequestException('OTP code is required');
    }

    try {
      // Verify OTP
      const stored = this.otpStore.get(dto.email);
      if (
        !stored ||
        stored.expires < Date.now() ||
        stored.otp !== dto.otp ||
        stored.type !== 'password_reset'
      ) {
        throw new BadRequestException('Invalid or expired OTP code');
      }

      // OPTIMIZATION: Get user by email from user_profiles (indexed query)
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .eq('email', dto.email)
        .single();

      if (!profile) {
        throw new BadRequestException('User not found');
      }

      // Update password hash directly
      const newHash = await bcrypt.hash(dto.password, 12);
      const { error } = await this.admin
        .from('user_profiles')
        .update({
          password_hash: newHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) {
        logger.warn('Password reset failed', {
          userId: profile.id,
          error: error.message,
        });
        throw new BadRequestException(
          `Password reset failed: ${error.message}`,
        );
      }

      // Clear OTP after successful reset
      this.otpStore.delete(dto.email);

      // OPTIMIZATION: Send confirmation email (already have username)
      try {
        const username = profile.username || 'User';
        await this.emailService.sendPasswordResetConfirmation(
          dto.email,
          username,
        );
      } catch (emailError) {
        logger.warn(
          'Password reset confirmation email failed, but password was reset',
          {
            userId: profile.id,
            error:
              emailError instanceof Error
                ? emailError.message
                : String(emailError),
          },
        );
      }

      logger.info('Password reset with OTP successful', {
        userId: profile.id,
      });
      return {
        message:
          'Password has been reset successfully. You can now log in with your new password.',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during password reset with OTP', {
        error,
      });
      throw new InternalServerErrorException(
        'Password reset service temporarily unavailable',
      );
    }
  }

  // REFRESH TOKEN - UPDATED TO RETURN BOTH TOKENS
  async refresh(dto: RefreshTokenDto) {
    logger.info('Token refresh attempt');

    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    try {
      const payload = this.jwt.verify(dto.refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });

      // Verify the user still exists
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select('id, email')
        .eq('id', payload.sub)
        .maybeSingle();

      if (userError || !user) {
        logger.warn('User not found during token refresh', {
          error: userError?.message,
        });
        throw new UnauthorizedException('User account no longer exists');
      }

      const tokens = this.generateTokens(user.id, user.email);

      logger.info('Token refresh successful', { userId: payload.sub });
      return tokens;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Invalid refresh token', { error: message });

      if (message.includes('jwt expired')) {
        throw new UnauthorizedException(
          'Refresh token has expired. Please log in again.',
        );
      } else if (
        message.includes('jwt malformed') ||
        message.includes('invalid signature')
      ) {
        throw new UnauthorizedException('Invalid refresh token.');
      } else {
        throw new UnauthorizedException(
          'Token refresh failed. Please log in again.',
        );
      }
    }
  }

  // LOGOUT — stateless JWTs, nothing to invalidate server-side
  async logout(userId?: string) {
    logger.info('Logout successful', { userId });
    return {
      message: 'Logged out successfully',
      timestamp: new Date().toISOString(),
    };
  }

  // SEND OTP (EMAIL)
  async sendOtp(dto: SendOtpDto) {
    logger.info('OTP send request', {});

    // Validate email format
    if (!this.validateEmail(dto.email)) {
      throw new BadRequestException(
        'Invalid email format. Please use a valid email address.',
      );
    }

    try {
      const emailLower = dto.email.toLowerCase();

      // Generate and store OTP
      const otp = this.generateOtp();
      await this.storeOtp(emailLower, otp, 'signup');

      // Get username for email
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('email', emailLower)
        .maybeSingle();

      await this.emailService.sendOtpEmail(
        dto.email,
        otp,
        profile?.username || 'User',
      );

      logger.info('OTP sent successfully', {});
      return {
        message:
          'One-time password has been sent to your email. Please check your inbox.',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during OTP send', {
        error,
      });
      throw new InternalServerErrorException(
        'OTP service temporarily unavailable',
      );
    }
  }

  async resendOtp(dto: SendOtpDto) {
    logger.info('Resend OTP request', {});

    if (!this.validateEmail(dto.email)) {
      throw new BadRequestException('Invalid email format.');
    }

    const email = dto.email.toLowerCase();
    const now = Date.now();

    const existing = this.otpStore.get(email);
    if (existing) {
      if (existing.attempts >= this.MAX_OTP_ATTEMPTS) {
        const timeLeft = this.OTP_COOLDOWN_MS - (now - existing.lastSent);
        if (timeLeft > 0) {
          const minutes = Math.ceil(timeLeft / 1000 / 60);
          throw new BadRequestException(
            `Too many attempts. Try again in ${minutes} minute(s).`,
          );
        }
        existing.attempts = 0;
      }
      if (now - existing.lastSent < 30_000) {
        throw new BadRequestException('Please wait 30 seconds.');
      }
    }

    // OPTIMIZATION: Query user_profiles directly instead of listUsers()
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('id, username')
      .eq('email', email)
      .single();

    // Check if user has already confirmed email
    let isEmailConfirmed = false;
    if (profile) {
      const { data: authData } = await this.admin
        .from('user_profiles')
        .select('email_confirmed_at')
        .eq('id', profile.id)
        .maybeSingle();
      isEmailConfirmed = !!authData?.email_confirmed_at;
    }

    // Allow resend if user exists and NOT confirmed OR has pending OTP
    if (isEmailConfirmed && !this.otpStore.has(email)) {
      throw new BadRequestException(
        'Email is already verified. Please log in.',
      );
    }

    const otp = this.generateOtp();
    this.otpStore.set(email, {
      otp,
      expires: now + 15 * 60 * 1000,
      attempts: (existing?.attempts || 0) + 1,
      lastSent: now,
      type: 'signup',
    });

    // OPTIMIZATION: Already have username from query above
    const username = profile?.username || 'User';

    await this.emailService.sendOtpEmail(dto.email, otp, username);

    return {
      message: 'A new code has been sent to your email.',
      attemptsRemaining:
        this.MAX_OTP_ATTEMPTS - ((existing?.attempts || 0) + 1),
    };
  }

  // ──────────────────────────────────────────────────────────────
  // VERIFY OTP — FINAL FIXED
  // ──────────────────────────────────────────────────────────────
  async verifyOtp(email: string, token: string) {
    logger.info('OTP verification attempt', {});

    if (!this.validateEmail(email))
      throw new BadRequestException('Invalid email format');
    if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
      throw new BadRequestException('Invalid OTP code');
    }

    const emailLower = email.toLowerCase();

    const isValid = await this.verifyStoredOtp(emailLower, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    // Try to find profile by email
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('id, username')
      .eq('email', emailLower)
      .single();

    // If profile not found by email, user doesn't exist
    if (!profile) {
      logger.warn('Profile not found by email during OTP verify', {});
      throw new UnauthorizedException('User not found');
    }

    // Mark email as confirmed
    await this.admin
      .from('user_profiles')
      .update({ email_confirmed_at: new Date().toISOString() })
      .eq('id', profile.id);

    return this.generateTokens(profile.id, email);
  }

  // ONBOARDING METHODS - UPDATED TO NOT DECRYPT RACE/GENDER
  async completeOnboarding(
    userId: string,
    data: OnboardingDataDto,
  ): Promise<{ message: string; has_completed_onboarding: boolean }> {
    return await this.onboardingService.saveOnboardingData(userId, data);
  }

  async getOnboardingStatus(
    userId: string,
  ): Promise<{ hasCompletedOnboarding: boolean }> {
    return await this.onboardingService.getOnboardingStatus(userId);
  }
  // GET CURRENT USER
  async getCurrentUser(userId: string): Promise<UserProfileResponse> {
    logger.info('Fetching current user', { userId });

    try {
      const { data: profile, error } = await this.admin
        .from('user_profiles')
        .select(
          `
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
      `,
        )
        .eq('id', userId)
        .single();

      if (error || !profile) {
        logger.warn('User profile not found — must sign up first', { userId });
        throw new UnauthorizedException(
          'User profile not found. Please sign up first.',
        );
      }

      const userData = this.cleanUserData(profile);

      // Include permissions for admin users
      if (profile.role === 'admin') {
        userData.permissions = await this.fetchAdminPermissions(userId);
      } else if (profile.role === 'super_admin') {
        userData.permissions = null; // super_admin has all permissions implicitly
      }

      return userData;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      logger.error('Failed to fetch user profile', { userId, error });
      throw new InternalServerErrorException('Unable to fetch user profile');
    }
  }

  // UPDATE USER PROFILE
  async updateProfile(userId: string, updateData: any) {
    logger.info('Updating user profile', { userId });

    // Filter out undefined + prepare encrypted fields safely
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

      // Encrypted fields (sent already encrypted from frontend)
      company_encrypted: updateData.company_encrypted,
      career_level_encrypted: updateData.career_level_encrypted,
      race_encrypted: updateData.race_encrypted,
      gender_encrypted: updateData.gender_encrypted,
      affinity_tags_encrypted: updateData.affinity_tags_encrypted,
    };

    // Remove undefined values
    const cleanedUpdate = Object.fromEntries(
      Object.entries(allowedFields).filter(([_, v]) => v !== undefined),
    );

    if (Object.keys(cleanedUpdate).length === 0) {
      throw new BadRequestException('No valid fields provided to update');
    }

    try {
      const { data, error } = await this.admin // ← CRITICAL: Use admin client!
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
        logger.error('Profile update failed in DB', {
          userId,
          error: error.message,
        });
        throw new BadRequestException('Failed to update profile');
      }

      logger.info('Profile updated successfully', { userId });
      return this.cleanUserData(data);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Unexpected error during profile update', { userId, error });
      throw new InternalServerErrorException('Profile update failed');
    }
  }

  // CHANGE PASSWORD
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    logger.info('Changing password', { userId });

    const passwordValidation = this.validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.message);
    }

    try {
      // Get user from DB
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select('id, email, password_hash')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new BadRequestException('User not found');
      }

      if (!user.password_hash) {
        throw new BadRequestException(
          'Cannot change password for OAuth-only accounts. Use Google sign-in.',
        );
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        logger.warn('Current password verification failed', { userId });
        throw new BadRequestException('Current password is incorrect');
      }

      // Hash and update new password
      const newHash = await bcrypt.hash(newPassword, 12);
      const { error } = await this.admin
        .from('user_profiles')
        .update({
          password_hash: newHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        logger.warn('Password change failed', { userId, error: error.message });
        throw new BadRequestException(
          `Password change failed: ${error.message}`,
        );
      }

      logger.info('Password changed successfully', { userId });
      return { message: 'Password changed successfully' };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during password change', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException(
        'Password change service temporarily unavailable',
      );
    }
  }

  // PRIVATE: FETCH ADMIN PERMISSIONS
  private async fetchAdminPermissions(userId: string): Promise<string[]> {
    try {
      const { data } = await this.admin
        .from('admin_permissions')
        .select('permissions')
        .eq('admin_id', userId)
        .maybeSingle();
      return data?.permissions ?? [];
    } catch {
      return [];
    }
  }

  // PRIVATE METHODS
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private cleanUserData(profile: any): UserProfileResponse {
    // Supabase returns `any` from .single(), so we cast safely
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

  // PRIVATE: CREATE PROFILE
  //
  private async createProfile(
    userId: string,
    username: string,
    email: string,
    avatar?: string,
    passwordHash?: string,
    authProvider: string = 'email',
    googleId?: string,
  ): Promise<boolean> {
    logger.info('Creating user profile', { userId, username });

    const profileData: Record<string, any> = {
      id: userId,
      username,
      email,
      password_hash: passwordHash || null,
      auth_provider: authProvider,
      google_id: googleId || null,
      avatar: avatar || AvatarGenerator.generate(userId).emoji,
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
        logger.warn('Username already taken, generating new one', {
          userId,
          username,
        });
        const uniqueUsername = this.generateUniqueUsername(username);
        return this.createProfileWithUniqueUsername(
          userId,
          uniqueUsername,
          email,
          avatar,
        );
      }

      logger.error('Failed to create profile', {
        userId,
        username,
        errorCode: error.code,
        errorMessage: error.message,
      });
      return false;
    }

    logger.info('Profile created successfully', { userId, username });
    return true;
  }

  private async createProfileWithUniqueUsername(
    userId: string,
    username: string,
    email: string,
    avatar?: string,
  ): Promise<boolean> {
    const { error } = await this.admin.from('user_profiles').insert({
      id: userId,
      username,
      email,
      avatar: avatar || AvatarGenerator.generate(userId).emoji,
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
      logger.error('Failed to create profile with unique username', {
        userId,
        username,
        error: error.message,
      });
      return false;
    }

    logger.info('Profile created with unique username', { userId, username });
    return true;
  }
  // Update ensureProfileExists to include email
  private async ensureProfileExists(
    userId: string,
    email: string,
  ): Promise<boolean> {
    logger.info('Ensuring profile exists', { userId });

    try {
      const { data: profile, error } = await this.admin
        .from('user_profiles')
        .select('id, username, email')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Profile check failed', {
          userId,
          error: error.message,
        });
      }

      if (!profile) {
        const username = this.generateUsername();
        const profileCreated = await this.createProfile(
          userId,
          username,
          email,
        );
        logger.info('Auto-created profile during login', {
          userId,
          username,
          profileCreated,
        });
        return profileCreated;
      } else {
        // Update email if it's missing in existing profile
        if (!profile.email) {
          await this.updateProfileEmail(userId, email);
        }
        logger.info('Profile already exists', {
          userId,
          username: profile.username,
        });
        return true;
      }
    } catch (error) {
      logger.error('Unexpected error during profile check', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Add method to update email for existing profiles
  private async updateProfileEmail(
    userId: string,
    email: string,
  ): Promise<void> {
    try {
      const { error } = await this.admin
        .from('user_profiles')
        .update({ email, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        logger.error('Failed to update profile email', {
          userId,
          error: error.message,
        });
      } else {
        logger.info('Updated profile email', { userId });
      }
    } catch (error) {
      logger.error('Unexpected error updating profile email', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private generateUniqueUsername(baseUsername: string): string {
    const timestamp = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(Math.random() * 1000);
    return `${baseUsername}_${timestamp}${randomSuffix}`.slice(0, 50);
  }

  private generateUsername(): string {
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
    logger.info('Generated username', { username });
    return username;
  }

  // PRIVATE: GENERATE TOKENS
  private generateTokens(userId: string, email: string) {
    try {
      // Calculate expires_in dynamically to avoid hard-coded values
      const accessTokenExpiresIn = '365d';
      const refreshTokenExpiresIn = '7d';

      const accessToken = this.jwt.sign(
        { sub: userId, email },
        {
          secret: this.config.get('JWT_SECRET'),
          expiresIn: accessTokenExpiresIn,
        },
      );

      const refreshToken = this.jwt.sign(
        { sub: userId, email },
        {
          secret: this.config.get('JWT_REFRESH_SECRET'),
          expiresIn: refreshTokenExpiresIn,
        },
      );

      // Convert '24h' to seconds (86400) for the response
      const expiresInSeconds = 24 * 60 * 60; // 86400

      logger.info('Tokens generated successfully', { userId });
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
    } catch (error) {
      logger.error('Token generation failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException(
        'Authentication service temporarily unavailable',
      );
    }
  }
}
