// auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  Put,
  Patch,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { LoginDto } from '../dto/login.dto';
import { SignupDto } from '../dto/signup.dto';
import { SendOtpDto, VerifyOtpDto } from '../dto/otp.dto';
import { AuthResponseDto } from '../dto/auth-response.dto';
import {
  ForgotPasswordDto,
  RefreshTokenDto,
  ChangePasswordDto,
} from '../dto/password.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { OnboardingDataDto } from '../dto/onboarding.dto';
import { ResetPasswordWithOtpDto } from '../dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({
    summary: 'Sign up with email and password',
    description:
      'Create a new user account. An OTP will be sent for email verification.',
  })
  @ApiResponse({
    status: 201,
    description:
      'User registered successfully. Check email for OTP verification.',
    schema: {
      example: {
        message:
          'Registration successful! Please check your email for the verification code.',
        userId: 'uuid-string',
        email: 'user@example.com',
        requiresOtpVerification: true,
        profileCreated: true,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or email already exists',
  })
  @ApiResponse({
    status: 409,
    description: 'Username or email already taken',
  })
  @ApiBody({ type: SignupDto })
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticate user with email and password. Returns access and refresh tokens.',
  })
  @ApiResponse({
    status: 200,
    type: AuthResponseDto,
    description: 'Login successful. Returns JWT tokens.',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or email not confirmed',
  })
  @ApiBody({ type: LoginDto })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Get('login/:provider')
  @ApiOperation({
    summary: 'Social login (Google/Facebook)',
    description: 'Initiate OAuth flow for social login. Returns redirect URL.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'facebook'],
    description: 'OAuth provider',
  })
  @ApiResponse({
    status: 200,
    description: 'OAuth URL generated successfully',
    schema: {
      example: {
        url: 'https://accounts.google.com/o/oauth2/auth?...',
        provider: 'google',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Unsupported provider',
  })
  async socialLogin(
    @Param('provider') provider: 'google' | 'facebook',
    @Query('redirect_uri') redirectUri?: string,
  ) {
    return this.authService.socialLogin(provider, redirectUri);
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Handles the redirect from Supabase after Google auth. Exchanges code for session and redirects to frontend with tokens.',
  })
  async googleCallback(
    @Query('code') code: string,
    @Query('redirect_uri') redirectUri: string,
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.authService.googleCallback(
      code,
      redirectUri,
    );
    return res.redirect(redirectUrl);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Send password reset link to email. Works even if email does not exist (for security).',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if account exists',
    schema: {
      example: {
        message:
          'If an account exists with this email, a password reset link has been sent.',
      },
    },
  })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password with token',
    description: 'Reset password using token from email. Token is required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
    schema: {
      example: {
        message: 'Password has been reset successfully.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
  })
  @ApiBody({ type: ResetPasswordWithOtpDto })
  async resetPassword(@Body() dto: ResetPasswordWithOtpDto) {
    return this.authService.resetPasswordWithOtp(dto);
  }

  @Public()
  @Post('refresh-token')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Get new access token using refresh token. Refresh token must be valid and not expired.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access token generated',
    schema: {
      example: {
        access_token: 'new-jwt-token',
        token_type: 'Bearer',
        expires_in: 900,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  @ApiBody({ type: RefreshTokenDto })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('logout')
  @ApiOperation({
    summary: 'Logout user',
    description:
      'Invalidate current session and logout user. Requires valid JWT token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    schema: {
      example: {
        message: 'Logged out successfully',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid token',
  })
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Get complete user profile information for authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid token',
  })
  async me(@CurrentUser() user: any) {
    return this.authService.getCurrentUser(user.userId);
  }

  @Public()
  @Post('otp/resend')
  @ApiOperation({
    summary: 'Resend OTP for email verification',
    description:
      'Resend one-time password for email verification. Limited to 3 attempts every 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
    schema: {
      example: {
        message: 'A new verification code has been sent to user@example.com.',
        attemptsRemaining: 2,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid email, rate limit exceeded, or email already verified',
  })
  @ApiBody({ type: SendOtpDto })
  async resendOtp(@Body() dto: SendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @ApiOperation({
    summary: 'Verify OTP for email verification',
    description:
      'Verify one-time password sent during signup to confirm email address. Returns JWT tokens on success.',
  })
  @ApiResponse({
    status: 200,
    type: AuthResponseDto,
    description: 'OTP verified and email confirmed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP',
  })
  @ApiBody({ type: VerifyOtpDto })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put('profile')
  @ApiOperation({
    summary: 'Update user profile',
    description:
      'Update authenticated user profile information. Only allowed fields can be updated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid profile data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid token',
  })
  @ApiBody({ type: UpdateProfileDto })
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('change-password')
  @ApiOperation({
    summary: 'Change password',
    description:
      'Change user password. Requires current password for verification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    schema: {
      example: {
        message: 'Password changed successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid current password or weak new password',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid token',
  })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(
    @CurrentUser() user: any,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  // ONBOARDING ENDPOINTS

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('onboarding/complete')
  @ApiOperation({
    summary: 'Complete user onboarding',
    description:
      'Save user onboarding data including demographics, career information, and preferences. Encrypts sensitive data.',
  })
  @ApiResponse({
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
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid onboarding data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid token',
  })
  @ApiBody({ type: OnboardingDataDto })
  async completeOnboarding(
    @CurrentUser() user: any,
    @Body() dto: OnboardingDataDto,
  ) {
    return this.authService.completeOnboarding(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('onboarding/status')
  @ApiOperation({
    summary: 'Get onboarding status',
    description:
      'Check if user has completed onboarding and get current onboarding data. Returns decrypted sensitive data.',
  })
  @ApiResponse({
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
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid token',
  })
  async getOnboardingStatus(@CurrentUser() user: any) {
    return this.authService.getOnboardingStatus(user.userId);
  }

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Auth service health check',
    description: 'Check if authentication service is running and healthy.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      example: {
        status: 'ok',
        service: 'auth',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    },
  })
  async health() {
    return {
      status: 'ok',
      service: 'auth',
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('session')
  @ApiOperation({
    summary: 'Get session information',
    description: 'Get current session information including token expiration.',
  })
  @ApiResponse({
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
  })
  async getSession(@CurrentUser() user: any) {
    // Calculate token expiration (assuming 15min tokens)
    const issuedAt = new Date(user.iat * 1000);
    const expiresAt = new Date(user.exp * 1000);

    return {
      userId: user.userId,
      email: user.email,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      timeRemaining: Math.max(
        0,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      ),
    };
  }
}
