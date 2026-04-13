// src/user/controllers/user.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UserService } from '../services/user.service';
import { UserProfileService } from '../services/user-profile.service';
import { UserSettingsService } from '../services/user-settings.service';
import { UserAccountService } from '../services/user-account.service';
import { UserBlockingService } from '../services/user-blocking.service';
import { UserResourcesService } from '../services/user-resources.service';
import { HarassmentReportService } from '../services/harassment-report.service';
import { FeedEngagementService } from '../../feeds/services/feed-engagement.service';
import { CompanyVerificationService } from '../services/company-verification.service';
import { UnifiedProfileService } from '../services/unified-profile.service';
import {
  VerifyCompanyEmailDto,
  UpdateVerificationEmailDto,
} from '../dto/company-verification.dto';
import { UnifiedProfileEditDto } from '../dto/unified-profile-edit.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import {
  UpdateProfileDto,
  UpdateAvatarDto,
  UpdateUsernameDto,
  UpdatePrivacySettingsDto,
  UpdateNotificationSettingsDto,
  DeactivateAccountDto,
  ReactivateAccountDto,
  DeleteAccountDto,
  BlockUserDto,
  CreateHarassmentReportDto,
  ExportDataDto,
  ChangePasswordDto,
} from '../dto/update-profile.dto';

@ApiTags('User')
@ApiBearerAuth()
@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private userService: UserService,
    private userProfileService: UserProfileService,
    private userSettingsService: UserSettingsService,
    private userAccountService: UserAccountService,
    private userBlockingService: UserBlockingService,
    private userResourcesService: UserResourcesService,
    private harassmentReportService: HarassmentReportService,
    private feedEngagementService: FeedEngagementService,
    private companyVerificationService: CompanyVerificationService,
    private unifiedProfileService: UnifiedProfileService,
  ) {}

  // ============ STATIC ROUTES FIRST (must come before :userId) ============

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: any) {
    return this.userService.getProfile(user.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiBody({ type: UpdateProfileDto })
  updateProfile(@CurrentUser() user: any, @Body() updates: UpdateProfileDto) {
    return this.userService.updateProfile(user.sub, updates);
  }

  @Patch('avatar')
  @ApiOperation({ summary: 'Update user avatar' })
  @ApiBody({ type: UpdateAvatarDto })
  updateAvatar(@Req() req: any, @Body() dto: UpdateAvatarDto) {
    const userId = req.user.sub;
    return this.userProfileService.updateAvatar(userId, dto.avatar);
  }

  @Patch('username')
  @ApiOperation({ summary: 'Update username' })
  @ApiBody({ type: UpdateUsernameDto })
  updateUsername(@Req() req: any, @Body() dto: UpdateUsernameDto) {
    const userId = req.user.sub;
    return this.userProfileService.updateUsername(userId, dto.username);
  }

  // ============ SETTINGS - PRIVACY ============

  @Get('settings/privacy')
  @ApiOperation({ summary: 'Get privacy settings' })
  getPrivacySettings(@Req() req: any) {
    const userId = req.user.sub;
    return this.userSettingsService.getPrivacySettings(userId);
  }

  @Put('settings/privacy')
  @ApiOperation({ summary: 'Update privacy settings' })
  @ApiBody({ type: UpdatePrivacySettingsDto })
  updatePrivacySettings(
    @Req() req: any,
    @Body() dto: UpdatePrivacySettingsDto,
  ) {
    const userId = req.user.sub;
    return this.userSettingsService.updatePrivacySettings(userId, dto);
  }

  // ============ SETTINGS - NOTIFICATIONS ============

  @Get('settings/notifications')
  @ApiOperation({ summary: 'Get notification settings' })
  getNotificationSettings(@Req() req: any) {
    const userId = req.user.sub;
    return this.userSettingsService.getNotificationSettings(userId);
  }

  @Put('settings/notifications')
  @ApiOperation({ summary: 'Update notification settings' })
  @ApiBody({ type: UpdateNotificationSettingsDto })
  updateNotificationSettings(
    @Req() req: any,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    const userId = req.user.sub;
    return this.userSettingsService.updateNotificationSettings(userId, dto);
  }

  // ============ ACCOUNT MANAGEMENT ============

  @Post('account/deactivate')
  @ApiOperation({ summary: 'Deactivate account' })
  @ApiBody({ type: DeactivateAccountDto })
  deactivateAccount(@Req() req: any, @Body() dto: DeactivateAccountDto) {
    const userId = req.user.sub;
    return this.userAccountService.deactivateAccount(userId, dto);
  }

  @Post('account/reactivate')
  @ApiOperation({ summary: 'Reactivate account' })
  @ApiBody({ type: ReactivateAccountDto })
  reactivateAccount(@Req() req: any, @Body() dto: ReactivateAccountDto) {
    const userId = req.user.sub;
    return this.userAccountService.reactivateAccount(userId);
  }

  @Post('account/change-password')
  @ApiOperation({ summary: 'Change account password' })
  @ApiBody({ type: ChangePasswordDto })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const userId = req.user.sub;
    return this.userAccountService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Delete('account')
  @ApiOperation({ summary: 'Delete account permanently' })
  @ApiBody({ type: DeleteAccountDto })
  deleteAccount(@Req() req: any, @Body() dto: DeleteAccountDto) {
    const userId = req.user.sub;
    return this.userAccountService.deleteAccount(userId, dto);
  }

  @Get('account/export')
  @ApiOperation({ summary: 'Export user data by category' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['all', 'profile', 'posts', 'comments', 'connections', 'activity'],
    description: 'Data category to export (default: all)',
  })
  exportUserData(@Req() req: any, @Query('category') category?: string) {
    const userId = req.user.sub;
    return this.userAccountService.exportUserData(userId, category || 'all');
  }

  // ============ BLOCKING ============

  @Get('blocked')
  @ApiOperation({ summary: 'Get blocked users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getBlockedUsers(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.sub;
    return this.userBlockingService.getBlockedUsers(userId, page, limit);
  }

  // ============ RESOURCES (static data) ============

  @Get('resources/crisis')
  @ApiOperation({
    summary: 'Get crisis resources',
    description:
      'Get mental health, workplace, identity-specific, and self-care crisis resources',
  })
  getCrisisResources() {
    return this.userResourcesService.getCrisisResources();
  }

  @Get('resources/community-guidelines')
  @ApiOperation({
    summary: 'Get community guidelines',
    description:
      'Get community guidelines including sections on respect, safety, communication, prohibited behavior, mentorship, content, and reporting',
  })
  getCommunityGuidelines() {
    return this.userResourcesService.getCommunityGuidelines();
  }

  // ============ MY ACTIVITY & BOOKMARKS ============

  @Get('me/activity')
  @ApiOperation({
    summary: 'Get current user activity',
    description:
      'Get aggregated activity (posts, topics, nook messages) for the current user',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['posts', 'topics', 'nooks', 'all'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyActivity(
    @Req() req: any,
    @Query('type') type?: 'posts' | 'topics' | 'nooks' | 'all',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.sub;
    return this.userProfileService.getUserActivity(
      userId,
      type || 'all',
      page || 1,
      limit || 20,
      userId,
    );
  }

  @Get('me/bookmarks')
  @ApiOperation({
    summary: 'Get current user bookmarks',
    description: 'Get bookmarked content for the current user',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyBookmarks(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.sub;
    return this.feedEngagementService.getUserBookmarks(
      userId,
      page || 1,
      limit || 20,
    );
  }

  // ============ HARASSMENT REPORTS ============

  @Post('reports/harassment')
  @ApiOperation({
    summary: 'Submit a harassment report',
    description: 'Submit a new harassment or safety incident report',
  })
  @ApiBody({ type: CreateHarassmentReportDto })
  submitHarassmentReport(
    @Req() req: any,
    @Body() dto: CreateHarassmentReportDto,
  ) {
    const userId = req.user.sub;
    return this.harassmentReportService.createReport(userId, dto);
  }

  @Get('reports/harassment')
  @ApiOperation({
    summary: 'Get my harassment reports',
    description:
      'Get list of harassment reports submitted by the current user, optionally filtered by status',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'submitted',
      'under_review',
      'investigating',
      'resolved',
      'dismissed',
      'all',
    ],
  })
  getMyHarassmentReports(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    const userId = req.user.sub;
    return this.harassmentReportService.getUserReports(
      userId,
      page,
      limit,
      status,
    );
  }

  @Get('reports/harassment/reference/:referenceNumber')
  @ApiOperation({
    summary: 'Get harassment report by reference number',
    description: 'Look up a harassment report using its reference number',
  })
  @ApiParam({
    name: 'referenceNumber',
    description: 'Report reference number (e.g., HR-XXXXX-XXXX)',
  })
  getHarassmentReportByReference(
    @Req() req: any,
    @Param('referenceNumber') referenceNumber: string,
  ) {
    const userId = req.user.sub;
    return this.harassmentReportService.getReportByReference(
      userId,
      referenceNumber,
    );
  }

  @Get('reports/harassment/:id')
  @ApiOperation({
    summary: 'Get harassment report by ID',
    description: 'Get a specific harassment report by its ID',
  })
  @ApiParam({ name: 'id', description: 'Report ID' })
  getHarassmentReportById(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.harassmentReportService.getReportById(userId, id);
  }

  // ============ UNIFIED PROFILE EDITING ============

  @Get('profile/edit')
  @ApiOperation({ summary: 'Get all editable profile data' })
  async getEditableProfile(@Req() req: any) {
    return this.unifiedProfileService.getEditableProfile(req.user.sub);
  }

  @Put('profile/edit')
  @ApiOperation({ summary: 'Update profile fields' })
  async updateEditableProfile(
    @Req() req: any,
    @Body() dto: UnifiedProfileEditDto,
  ) {
    return this.unifiedProfileService.updateProfile(req.user.sub, dto);
  }

  // ============ COMPANY VERIFICATION ============

  @Post('verify-company-email')
  @ApiOperation({ summary: 'Request company email verification' })
  async requestCompanyVerification(
    @Req() req: any,
    @Body() dto: VerifyCompanyEmailDto,
  ) {
    return this.companyVerificationService.requestVerification(
      req.user.sub,
      dto.email,
    );
  }

  @Put('company-verification-email')
  @ApiOperation({
    summary:
      'Update verification email for a pending request (before verification is confirmed)',
  })
  async updateVerificationEmail(
    @Req() req: any,
    @Body() dto: UpdateVerificationEmailDto,
  ) {
    return this.companyVerificationService.updateVerificationEmail(
      req.user.sub,
      dto.email,
    );
  }

  @Get('company-verification-status')
  @ApiOperation({ summary: 'Get company verification status' })
  async getCompanyVerificationStatus(@Req() req: any) {
    return this.companyVerificationService.getVerificationStatus(req.user.sub);
  }

  // ============ DYNAMIC :userId ROUTES LAST ============

  @Get(':userId')
  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  getUserById(@Req() req: any, @Param('userId') userId: string) {
    const currentUserId = req.user.sub;
    return this.userProfileService.getUserProfileById(userId, currentUserId);
  }

  @Get(':userId/stats')
  @ApiOperation({ summary: 'Get user statistics' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  getUserStats(@Param('userId') userId: string) {
    return this.userProfileService.getUserStats(userId);
  }

  @Get(':userId/badges')
  @ApiOperation({ summary: 'Get user badges' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  getUserBadges(@Param('userId') userId: string) {
    return this.userProfileService.getUserBadges(userId);
  }

  @Get(':userId/full-profile')
  @ApiOperation({
    summary: 'Get full user profile',
    description:
      'Single endpoint: profile + stats + recent posts/topics/nooks/comments + identity reveal status + viewer engagement. Badges excluded for other users.',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  getFullUserProfile(@Req() req: any, @Param('userId') userId: string) {
    const currentUserId = req.user.sub;
    return this.userProfileService.getFullUserProfile(userId, currentUserId);
  }

  @Get(':userId/activity')
  @ApiOperation({ summary: 'Get user activity' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['posts', 'topics', 'nooks', 'all'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUserActivity(
    @Req() req: any,
    @Param('userId') userId: string,
    @Query('type') type?: 'posts' | 'topics' | 'nooks' | 'all',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const currentUserId = req.user.sub;
    return this.userProfileService.getUserActivity(
      userId,
      type,
      page,
      limit,
      currentUserId,
    );
  }

  @Post(':userId/block')
  @ApiOperation({ summary: 'Block a user' })
  @ApiParam({ name: 'userId', description: 'User ID to block' })
  @ApiBody({ type: BlockUserDto })
  blockUser(
    @Req() req: any,
    @Param('userId') targetUserId: string,
    @Body() dto: BlockUserDto,
  ) {
    const userId = req.user.sub;
    return this.userBlockingService.blockUser(userId, targetUserId, dto);
  }

  @Delete(':userId/block')
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiParam({ name: 'userId', description: 'User ID to unblock' })
  unblockUser(@Req() req: any, @Param('userId') targetUserId: string) {
    const userId = req.user.sub;
    return this.userBlockingService.unblockUser(userId, targetUserId);
  }

  @Get(':userId/block/status')
  @ApiOperation({ summary: 'Check block status with a user' })
  @ApiParam({ name: 'userId', description: 'User ID to check' })
  getBlockStatus(@Req() req: any, @Param('userId') targetUserId: string) {
    const userId = req.user.sub;
    return this.userBlockingService.getBlockStatus(userId, targetUserId);
  }
}
