import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  supabaseClient,
  supabaseAdmin,
} from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { EmailService } from '../../../common/utils/email/email.service';
import { SignupDto } from '../dto/signup.dto';
import { LoginDto } from '../dto/login.dto';
import { SendOtpDto } from '../dto/otp.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordWithOtpDto } from '../dto/reset-password.dto';
import { RefreshTokenDto } from '../dto/password.dto';
import { OnboardingDataDto } from '../dto/onboarding.dto';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class AuthService {
  private supabase;
  private admin;
  // UPDATE THIS TYPE DEFINITION
  private otpStore: Map<string, { 
    otp: string; 
    expires: number; 
    attempts: number; 
    lastSent: number;
    type?: string; // ADD THIS - make it optional
  }>;
  private readonly MAX_OTP_ATTEMPTS = 3;
  private readonly OTP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private config: ConfigService,
    private jwt: JwtService,
    private encryption: EncryptionUtil,
    private emailService: EmailService,
  ) {
    this.supabase = supabaseClient(config);
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
    if (!password || password.length < 6) {
      return {
        isValid: false,
        message: 'Password must be at least 6 characters long',
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

  // EMAIL + PASSWORD SIGNUP
  async signup(dto: SignupDto) {
    logger.info('Signup attempt', { email: dto.email, username: dto.username });

    // Validate inputs
    if (!this.validateEmail(dto.email)) {
      logger.warn('Signup failed: Invalid email format', { email: dto.email });
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

    // Create user in Supabase Auth with retry logic
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: dto.email,
        password: dto.password,
        options: {
          data: { username: dto.username },
        },
      });

      if (error) {
        logger.warn('Signup failed via Supabase', {
          email: dto.email,
          error: error.message,
          errorCode: error.code,
        });

        if (
          error.message.includes('invalid email') ||
          error.message.includes('Email address')
        ) {
          throw new BadRequestException(
            'Please use a valid email address format (e.g., user@example.com)',
          );
        } else if (
          error.message.includes('already registered') ||
          error.message.includes('user_exists')
        ) {
          throw new ConflictException(
            'An account with this email already exists. Please try logging in instead.',
          );
        } else if (
          error.message.includes('password') ||
          error.message.includes('weak_password')
        ) {
          throw new BadRequestException(
            'Password does not meet security requirements. Please choose a stronger password.',
          );
        } else if (error.message.includes('rate limit')) {
          throw new BadRequestException(
            'Too many registration attempts. Please try again in a few minutes.',
          );
        } else if (
          error.message.includes('fetch failed') ||
          error.message.includes('SocketError')
        ) {
          throw new InternalServerErrorException(
            'Authentication service is temporarily unavailable. Please try again in a moment.',
          );
        } else {
          throw new BadRequestException(
            `Registration failed: ${error.message}`,
          );
        }
      }

      if (!data.user) {
        logger.error('Signup failed: No user returned from Supabase', {
          email: dto.email,
        });
        throw new BadRequestException('Registration failed - please try again');
      }

      // Create user profile
      let profileCreated = false;
      try {
        profileCreated = await this.createProfile(
          data.user.id,
          dto.username,
          dto.email,
        );
      } catch (profileError) {
        logger.error('Profile creation failed but signup succeeded', {
          userId: data.user.id,
          error:
            profileError instanceof Error
              ? profileError.message
              : String(profileError),
        });
      }

      // Generate and send OTP for email verification
      const otp = this.generateOtp();
      await this.emailService.sendOtpEmail(dto.email, otp, dto.username);

      // Store OTP in temporary storage
      await this.storeOtp(dto.email, otp);

      logger.info('Signup successful - OTP sent', {
        userId: data.user.id,
        email: dto.email,
        username: dto.username,
        profileCreated,
      });

      return {
        message:
          'Registration successful! Please check your email for the verification code.',
        userId: data.user.id,
        email: data.user.email,
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
        email: dto.email,
      });
      throw new InternalServerErrorException(
        'Registration failed due to an unexpected error',
      );
    }
  }

  // EMAIL + PASSWORD LOGIN
  async login(dto: LoginDto) {
    logger.info('Login attempt', { email: dto.email });

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
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: dto.email,
        password: dto.password,
      });

      if (error) {
        logger.warn('Login failed', {
          email: dto.email,
          error: error.message,
          errorCode: error.code,
        });

        if (error.message.includes('Invalid login credentials')) {
          throw new UnauthorizedException(
            'Invalid email or password. Please check your credentials and try again.',
          );
        } else if (error.message.includes('Email not confirmed')) {
          throw new UnauthorizedException(
            'Please confirm your email address before logging in. Check your inbox for the confirmation link.',
          );
        } else if (error.message.includes('rate limit')) {
          throw new UnauthorizedException(
            'Too many login attempts. Please try again in a few minutes.',
          );
        } else if (error.message.includes('user_not_found')) {
          throw new UnauthorizedException(
            'No account found with this email. Please sign up first.',
          );
        } else if (
          error.message.includes('fetch failed') ||
          error.message.includes('SocketError')
        ) {
          throw new InternalServerErrorException(
            'Authentication service is temporarily unavailable. Please try again in a moment.',
          );
        } else {
          throw new UnauthorizedException(`Login failed: ${error.message}`);
        }
      }

      if (!data.session) {
        logger.warn('Login failed: No session created', { email: dto.email });
        throw new UnauthorizedException(
          'Login failed - unable to create session',
        );
      }

      if (!data.user) {
        logger.warn('Login failed: No user data returned', {
          email: dto.email,
        });
        throw new UnauthorizedException('Login failed - user data missing');
      }

      // Ensure user profile exists - don't fail login if profile creation has issues
      let profileExists = false;
      try {
        profileExists = await this.ensureProfileExists(
          data.user.id,
          data.user.email!,
        );
      } catch (profileError) {
        logger.warn(
          'Profile check/creation failed during login, but continuing',
          {
            userId: data.user.id,
            error:
              profileError instanceof Error
                ? profileError.message
                : String(profileError),
          },
        );
      }

      logger.info('Login successful', {
        userId: data.user.id,
        email: data.user.email,
        profileExists,
      });

      return this.generateTokens(data.user.id, data.user.email!);
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
        email: dto.email,
      });
      throw new InternalServerErrorException(
        'Login service temporarily unavailable',
      );
    }
  }

  // SOCIAL LOGIN (GOOGLE / FACEBOOK)
  async socialLogin(provider: 'google' | 'facebook') {
    logger.info('Social login initiated', { provider });

    if (!['google', 'facebook'].includes(provider)) {
      throw new BadRequestException('Unsupported social login provider');
    }

    try {
      const redirectTo = `${this.config.get('FRONTEND_URL')}/auth/callback`;
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: {
          redirectTo,
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        logger.warn('Social login failed', { provider, error: error.message });
        throw new BadRequestException(
          `Social login with ${provider} failed: ${error.message}`,
        );
      }

      if (!data.url) {
        logger.error('Social login URL not generated', { provider });
        throw new BadRequestException(
          'Social login service temporarily unavailable',
        );
      }

      logger.info('Social login URL generated', { provider, url: data.url });
      return {
        url: data.url,
        provider,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during social login', { error, provider });
      throw new InternalServerErrorException(
        'Social login service temporarily unavailable',
      );
    }
  }


// ALTERNATIVE APPROACH - USE OTP FOR PASSWORD RESET
async forgotPassword(dto: ForgotPasswordDto) {
  logger.info('Password reset requested', { email: dto.email });

  if (!this.validateEmail(dto.email)) {
    throw new BadRequestException('Invalid email format');
  }

  try {
    // Use Supabase's OTP system but with custom email
    const { data: userData, error: userError } = await this.admin.auth.admin.listUsers();
    const user = userData?.users.find(u => u.email === dto.email);
    
    if (!user) {
      // For security, don't reveal whether email exists
      logger.info('Password reset requested for non-existent email', { email: dto.email });
      return {
        message: 'If an account exists with this email, a password reset link has been sent. Please check your inbox and spam folder.',
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
      type: 'password_reset' // Mark as password reset OTP
    });

    // Get username for email
    let username = 'User';
    try {
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', user.id)
        .single();
      
      if (profile?.username) {
        username = profile.username;
      }
    } catch (profileError) {
      logger.warn('Could not fetch user profile for password reset', {
        userId: user.id,
        error: profileError instanceof Error ? profileError.message : String(profileError),
      });
    }

    // Send custom password reset OTP email
    await this.emailService.sendPasswordResetOtpEmail(dto.email, resetOtp, username);

    logger.info('Password reset OTP sent successfully', {
      email: dto.email,
      userId: user.id,
    });

    return {
      message: 'If an account exists with this email, a password reset code has been sent. Please check your inbox.',
      method: 'otp'
    };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    logger.error('Unexpected error during password reset request', {
      error,
      email: dto.email,
    });
    throw new InternalServerErrorException(
      'Password reset service temporarily unavailable',
    );
  }
}

async resetPasswordWithOtp(dto: ResetPasswordWithOtpDto & { otp: string }) {
  logger.info('Password reset with OTP attempt', { email: dto.email, hasOtp: !!dto.otp });

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
    if (!stored || stored.expires < Date.now() || stored.otp !== dto.otp || stored.type !== 'password_reset') {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Get user by email
    const { data: userData, error: userError } = await this.admin.auth.admin.listUsers();
    const user = userData?.users.find(u => u.email === dto.email);
    
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Update password using Admin API
    const { data, error } = await this.admin.auth.admin.updateUserById(
      user.id,
      { password: dto.password }
    );

    if (error) {
      logger.warn('Password reset failed', {
        userId: user.id,
        error: error.message,
        errorCode: error.code,
      });

      if (error.message.includes('password')) {
        throw new BadRequestException(
          'Password does not meet security requirements. Please choose a stronger password.',
        );
      } else {
        throw new BadRequestException(
          `Password reset failed: ${error.message}`,
        );
      }
    }

    // Clear OTP after successful reset
    this.otpStore.delete(dto.email);

    // Send confirmation email
    try {
      let username = 'User';
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', user.id)
        .single();
      
      if (profile?.username) {
        username = profile.username;
      }

      await this.emailService.sendPasswordResetConfirmation(dto.email, username);
    } catch (emailError) {
      logger.warn('Password reset confirmation email failed, but password was reset', {
        userId: user.id,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    logger.info('Password reset with OTP successful', { userId: user.id });
    return {
      message: 'Password has been reset successfully. You can now log in with your new password.',
    };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    logger.error('Unexpected error during password reset with OTP', { error });
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

      // Verify the user still exists in Supabase
      const {
        data: { user },
        error: userError,
      } = await this.supabase.auth.getUser();

      if (userError || !user) {
        logger.warn('User not found during token refresh', {
          error: userError?.message,
        });
        throw new UnauthorizedException('User account no longer exists');
      }

      // Generate new tokens (both access and refresh)
      const tokens = this.generateTokens(user.id, user.email!);

      logger.info('Token refresh successful', { userId: payload.sub });
      return tokens;
    } catch (err) {
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

  // LOGOUT
  async logout(userId?: string) {
    logger.info('Logout initiated', { userId });

    try {
      const { error } = await this.supabase.auth.signOut();

      if (error) {
        logger.warn('Logout error from Supabase', {
          userId,
          error: error.message,
        });
        // Don't throw error for logout failures as user is already leaving
      }

      logger.info('Logout successful', { userId });
      return {
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Unexpected error during logout', { error, userId });
      // Still return success for logout to avoid user frustration
      return {
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // SEND OTP (EMAIL)
  async sendOtp(dto: SendOtpDto) {
    logger.info('OTP send request', { email: dto.email });

    // Validate email format
    if (!this.validateEmail(dto.email)) {
      throw new BadRequestException(
        'Invalid email format. Please use a valid email address.',
      );
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithOtp({
        email: dto.email,
        options: {
          emailRedirectTo: `${this.config.get('FRONTEND_URL')}/auth/callback`,
        },
      });

      if (error) {
        logger.warn('OTP send failed', {
          email: dto.email,
          error: error.message,
        });

        if (error.message.includes('rate limit')) {
          throw new BadRequestException(
            'Too many OTP requests. Please try again in a few minutes.',
          );
        } else {
          throw new BadRequestException(`OTP send failed: ${error.message}`);
        }
      }

      logger.info('OTP sent successfully', { email: dto.email });
      return {
        message: `One-time password has been sent to ${dto.email}. Please check your inbox.`,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during OTP send', {
        error,
        email: dto.email,
      });
      throw new InternalServerErrorException(
        'OTP service temporarily unavailable',
      );
    }
  }

 // RESEND OTP WITH RATE LIMITING
  async resendOtp(dto: SendOtpDto) {
    logger.info('Resend OTP request', { email: dto.email });

    // Validate email format
    if (!this.validateEmail(dto.email)) {
      throw new BadRequestException(
        'Invalid email format. Please use a valid email address.',
      );
    }

    try {
      // Check rate limiting
      const existingOtp = this.otpStore.get(dto.email);
      const now = Date.now();

      if (existingOtp) {
        // Check if user has exceeded maximum attempts
        if (existingOtp.attempts >= this.MAX_OTP_ATTEMPTS) {
          const timeSinceLastAttempt = now - existingOtp.lastSent;
          if (timeSinceLastAttempt < this.OTP_COOLDOWN_MS) {
            const remainingTime = Math.ceil((this.OTP_COOLDOWN_MS - timeSinceLastAttempt) / 1000 / 60);
            throw new BadRequestException(
              `Too many OTP requests. Please try again in ${remainingTime} minutes.`,
            );
          } else {
            // Reset attempts after cooldown period
            existingOtp.attempts = 0;
          }
        }

        // Check if we're sending too quickly (minimum 30 seconds between sends)
        const timeSinceLastSend = now - existingOtp.lastSent;
        if (timeSinceLastSend < 30000) { // 30 seconds
          throw new BadRequestException(
            'Please wait 30 seconds before requesting another OTP.',
          );
        }
      }

      // Check if user exists and is not verified
      const { data: userData, error: userError } = await this.admin.auth.admin.listUsers();
      const user = userData?.users.find(u => u.email === dto.email);
      
      if (!user) {
        // For security, don't reveal whether email exists
        logger.info('OTP requested for non-existent email', { email: dto.email });
        return {
          message: 'If an account exists with this email, a new verification code has been sent.',
        };
      }

      // Check if user is already verified
      if (user.email_confirmed_at) {
        throw new BadRequestException('Email is already verified. Please log in instead.');
      }

      // Generate new OTP
      const otp = this.generateOtp();
      
      // Update OTP store with new attempt
      this.otpStore.set(dto.email, {
        otp,
        expires: now + 15 * 60 * 1000, // 15 minutes
        attempts: (existingOtp?.attempts || 0) + 1,
        lastSent: now
      });

      // Get username for email
      let username = 'User';
      try {
        const { data: profile } = await this.admin
          .from('user_profiles')
          .select('username')
          .eq('id', user.id)
          .single();
        
        if (profile?.username) {
          username = profile.username;
        }
      } catch (profileError) {
        logger.warn('Could not fetch user profile for OTP resend', {
          userId: user.id,
          error: profileError instanceof Error ? profileError.message : String(profileError),
        });
      }

      // Send OTP email
      await this.emailService.sendOtpEmail(dto.email, otp, username);

      logger.info('OTP resent successfully', { 
        email: dto.email,
        userId: user.id,
        attempt: (existingOtp?.attempts || 0) + 1
      });

      return {
        message: `A new verification code has been sent to ${dto.email}. Please check your inbox.`,
        attemptsRemaining: this.MAX_OTP_ATTEMPTS - ((existingOtp?.attempts || 0) + 1)
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during OTP resend', {
        error,
        email: dto.email,
      });
      throw new InternalServerErrorException(
        'OTP service temporarily unavailable',
      );
    }
  }

  // VERIFY OTP - UPDATED TO HANDLE RATE LIMITING
  async verifyOtp(email: string, token: string) {
    logger.info('OTP verification attempt', { email });

    if (!this.validateEmail(email)) {
      throw new BadRequestException('Invalid email format');
    }

    if (!token || token.length !== 6) {
      throw new BadRequestException('Invalid OTP code');
    }

    try {
      // Verify OTP from storage
      const isValidOtp = await this.verifyStoredOtp(email, token);
      if (!isValidOtp) {
        throw new UnauthorizedException('Invalid or expired OTP code');
      }

      // Get user by email
      const { data: userData, error: userError } = await this.admin.auth.admin.listUsers();
      const user = userData?.users.find(u => u.email === email);
      
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Update user email confirmation status
      await this.admin.auth.admin.updateUserById(
        user.id,
        { email_confirm: true }
      );

      let profileExists = false;
      try {
        profileExists = await this.ensureProfileExists(user.id, email);
      } catch (profileError) {
        logger.warn(
          'Profile creation failed during OTP verification, but continuing',
          {
            userId: user.id,
            error: profileError instanceof Error ? profileError.message : String(profileError),
          },
        );
      }

      // Send welcome email
      await this.emailService.sendWelcomeEmail(email, user.user_metadata?.username || 'User');

      // Clear OTP attempts on successful verification
      this.otpStore.delete(email);

      logger.info('OTP verified and email confirmed', {
        userId: user.id,
        email,
        profileExists,
      });

      return this.generateTokens(user.id, email);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error during OTP verification', {
        error,
        email,
      });
      throw new InternalServerErrorException(
        'OTP verification service temporarily unavailable',
      );
    }
  }

  // ONBOARDING METHODS - UPDATED TO NOT DECRYPT RACE/GENDER
  async completeOnboarding(userId: string, data: OnboardingDataDto) {
    logger.info('Completing onboarding', { userId });

    try {
      // Encrypt sensitive data
      const encryptedData: any = {
        has_completed_onboarding: true,
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      // Encrypt sensitive fields - DO NOT DECRYPT WHEN RETURNING
      if (data.race) {
        encryptedData.race_encrypted = this.encryption.encrypt(data.race);
      }
      if (data.gender) {
        encryptedData.gender_encrypted = this.encryption.encrypt(data.gender);
      }

      // Add non-sensitive fields
      if (data.careerLevel)
        encryptedData.career_level = data.careerLevel.substring(0, 20); // Truncate to 20 chars
      if (data.company) encryptedData.company = data.company;
      if (data.jobTitle) encryptedData.job_title = data.jobTitle;
      if (data.location) encryptedData.location = data.location;
      if (data.skills) encryptedData.skills = data.skills;
      if (data.affinityTags) encryptedData.affinity_tags = data.affinityTags;
      if (data.isWillingToMentor !== undefined) {
        encryptedData.is_willing_to_mentor = data.isWillingToMentor;
      }

      const { data: updatedUser, error } = await this.admin
        .from('user_profiles')
        .update(encryptedData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to save onboarding data', {
          userId,
          error: error.message,
        });
        throw new BadRequestException(
          `Failed to save onboarding data: ${error.message}`,
        );
      }

      logger.info('Onboarding completed successfully', { userId });

      // Return user data WITHOUT decrypting race/gender - frontend will handle decryption
      return {
        message: 'Onboarding completed successfully',
        user: this.cleanUserData(updatedUser), // Use cleanUserData instead of decryptUserData
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during onboarding', {
        userId,
        error,
      });
      throw new InternalServerErrorException(
        'Onboarding service temporarily unavailable',
      );
    }
  }

  async getOnboardingStatus(userId: string) {
    logger.info('Fetching onboarding status', { userId });

    try {
      const { data: user, error } = await this.admin
        .from('user_profiles')
        .select(
          'has_completed_onboarding, career_level, company, job_title, location, skills, affinity_tags, is_willing_to_mentor, race_encrypted, gender_encrypted',
        )
        .eq('id', userId)
        .single();

      if (error) {
        logger.warn('User not found when fetching onboarding status', {
          userId,
        });
        throw new UnauthorizedException('User not found');
      }

      // Return encrypted data - frontend will decrypt if needed
      return {
        hasCompletedOnboarding: user.has_completed_onboarding,
        currentData: {
          careerLevel: user.career_level,
          company: user.company,
          jobTitle: user.job_title,
          location: user.location,
          skills: user.skills,
          affinityTags: user.affinity_tags,
          isWillingToMentor: user.is_willing_to_mentor,
          raceEncrypted: user.race_encrypted, // Send encrypted to frontend
          genderEncrypted: user.gender_encrypted, // Send encrypted to frontend
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      logger.error('Unexpected error fetching onboarding status', {
        userId,
        error,
      });
      throw new InternalServerErrorException(
        'Unable to fetch onboarding status',
      );
    }
  }

  // GET CURRENT USER
  async getCurrentUser(userId: string) {
    logger.info('Fetching current user', { userId });

    try {
      const { data: user, error } = await this.admin
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        logger.warn('User profile not found, creating one', {
          userId,
          error: error.message,
        });

        // Auto-create profile if not found
        const profileCreated = await this.ensureProfileExists(userId, '');
        if (profileCreated) {
          // Retry fetching the user
          const { data: newUser, error: retryError } = await this.admin
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (!retryError && newUser) {
            return this.cleanUserData(newUser); // Use cleanUserData
          }
        }

        throw new UnauthorizedException(
          'User profile not found and could not be created',
        );
      }

      logger.info('User profile fetched successfully', { userId });
      return this.cleanUserData(user); // Use cleanUserData
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      logger.error('Unexpected error fetching user profile', { userId, error });
      throw new InternalServerErrorException('Unable to fetch user profile');
    }
  }

  // UPDATE USER PROFILE
  async updateProfile(userId: string, updateData: any) {
    logger.info('Updating user profile', { userId });

    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        logger.warn('Profile update failed', { userId, error: error.message });
        throw new BadRequestException(
          `Profile update failed: ${error.message}`,
        );
      }

      logger.info('Profile updated successfully', { userId });
      return this.cleanUserData(data); // Use cleanUserData
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during profile update', { userId, error });
      throw new InternalServerErrorException(
        'Profile update service temporarily unavailable',
      );
    }
  }

  // CHANGE PASSWORD
async changePassword(userId: string, currentPassword: string, newPassword: string) {
    logger.info('Changing password', { userId });

    const passwordValidation = this.validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.message);
    }

    try {
      // Get user email from Supabase Auth, not from user_profiles table
      const { data: { user }, error: userError } = await this.supabase.auth.getUser();
      
      if (userError || !user) {
        logger.error('User not found in Supabase Auth during password change', {
          userId,
          error: userError?.message
        });
        throw new BadRequestException('User not found');
      }

      const userEmail = user.email;

      if (!userEmail) {
        throw new BadRequestException('User email not found');
      }

      // Verify current password by attempting to sign in
      const { error: signInError } = await this.supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (signInError) {
        logger.warn('Current password verification failed', {
          userId,
          error: signInError.message
        });
        throw new BadRequestException('Current password is incorrect');
      }

      // Update password
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        logger.warn('Password change failed', { 
          userId, 
          error: error.message,
          errorCode: error.code 
        });
        
        if (error.message.includes('password')) {
          throw new BadRequestException(
            'Password does not meet security requirements. Please choose a stronger password.',
          );
        } else {
          throw new BadRequestException(`Password change failed: ${error.message}`);
        }
      }

      logger.info('Password changed successfully', { userId });
      return { message: 'Password changed successfully' };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error during password change', { 
        userId, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw new InternalServerErrorException('Password change service temporarily unavailable');
    }
  }

  // PRIVATE METHODS
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

 private async storeOtp(email: string, otp: string): Promise<void> {
    const now = Date.now();
    this.otpStore.set(email, {
      otp,
      expires: now + 15 * 60 * 1000, // 15 minutes
      attempts: 1,
      lastSent: now
    });
  }

private async verifyStoredOtp(email: string, otp: string): Promise<boolean> {
    const stored = this.otpStore.get(email);
    if (!stored || stored.expires < Date.now()) {
      return false;
    }
    
    // Remove OTP after verification (successful or not)
    this.otpStore.delete(email);
    return stored.otp === otp;
  }


  private cleanUserData(user: any): any {
    const cleaned = { ...user };

    // Remove the decrypted fields if they exist
    delete cleaned.race;
    delete cleaned.gender;

    // Keep the encrypted fields as they are - frontend will decrypt
    return cleaned;
  }

  // PRIVATE: CREATE PROFILE
  private async createProfile(
    userId: string,
    username: string,
    email: string,
  ): Promise<boolean> {
    logger.info('Creating user profile', { userId, username, email });

    try {
      const profileData = {
        id: userId,
        username,
        email,
        avatar: 'User',
        privacy_level: 'anonymous',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      const { data, error } = await this.admin
        .from('user_profiles')
        .insert(profileData)
        .select();

      if (error) {
        // Check if it's a unique constraint violation (username already exists)
        if (error.code === '23505') {
          logger.warn('Username already taken, generating new one', {
            userId,
            username,
            errorMessage: error.message,
          });
          const uniqueUsername = this.generateUniqueUsername(username);
          return await this.createProfileWithUniqueUsername(
            userId,
            uniqueUsername,
            email,
          );
        } else {
          logger.error('Failed to create profile', {
            userId,
            username,
            email,
            errorMessage: error.message,
            errorCode: error.code,
          });
          return false;
        }
      }

      // Success case - profile created
      logger.info('Profile created successfully', {
        userId,
        username,
        email,
        profileId: data?.[0]?.id,
      });
      return true;
    } catch (error) {
      logger.error('Unexpected error during profile creation', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async createProfileWithUniqueUsername(
    userId: string,
    username: string,
    email: string,
  ): Promise<boolean> {
    try {
      const { error } = await this.admin.from('user_profiles').insert({
        id: userId,
        username,
        email,
        avatar: 'User',
        privacy_level: 'anonymous',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });

      if (error) {
        logger.error('Failed to create profile even with unique username', {
          userId,
          username,
          email,
          error: error.message,
        });
        return false;
      }

      logger.info('Profile created with unique username', {
        userId,
        username,
        email,
      });
      return true;
    } catch (error) {
      logger.error('Unexpected error during fallback profile creation', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Update ensureProfileExists to include email
  private async ensureProfileExists(
    userId: string,
    email: string,
  ): Promise<boolean> {
    logger.info('Ensuring profile exists', { userId, email });

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
          email,
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
          email: profile.email,
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
          email,
          error: error.message,
        });
      } else {
        logger.info('Updated profile email', { userId, email });
      }
    } catch (error) {
      logger.error('Unexpected error updating profile email', {
        userId,
        email,
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
      const accessToken = this.jwt.sign(
        { sub: userId, email },
        {
          secret: this.config.get('JWT_SECRET'),
          expiresIn: '15m',
        },
      );

      const refreshToken = this.jwt.sign(
        { sub: userId, email },
        {
          secret: this.config.get('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      );

      logger.info('Tokens generated successfully', { userId, email });
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 900,
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
