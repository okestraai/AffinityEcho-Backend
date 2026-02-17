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
exports.UserController = void 0;
const common_1 = require("@nestjs/common");
const user_service_1 = require("../services/user.service");
const user_profile_service_1 = require("../services/user-profile.service");
const user_settings_service_1 = require("../services/user-settings.service");
const user_account_service_1 = require("../services/user-account.service");
const user_blocking_service_1 = require("../services/user-blocking.service");
const user_resources_service_1 = require("../services/user-resources.service");
const harassment_report_service_1 = require("../services/harassment-report.service");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const swagger_1 = require("@nestjs/swagger");
const update_profile_dto_1 = require("../dto/update-profile.dto");
let UserController = class UserController {
    constructor(userService, userProfileService, userSettingsService, userAccountService, userBlockingService, userResourcesService, harassmentReportService) {
        this.userService = userService;
        this.userProfileService = userProfileService;
        this.userSettingsService = userSettingsService;
        this.userAccountService = userAccountService;
        this.userBlockingService = userBlockingService;
        this.userResourcesService = userResourcesService;
        this.harassmentReportService = harassmentReportService;
    }
    getProfile(user) {
        return this.userService.getProfile(user.sub);
    }
    updateProfile(user, updates) {
        return this.userService.updateProfile(user.sub, updates);
    }
    updateAvatar(req, dto) {
        const userId = req.user.sub;
        return this.userProfileService.updateAvatar(userId, dto.avatar);
    }
    updateUsername(req, dto) {
        const userId = req.user.sub;
        return this.userProfileService.updateUsername(userId, dto.username);
    }
    getPrivacySettings(req) {
        const userId = req.user.sub;
        return this.userSettingsService.getPrivacySettings(userId);
    }
    updatePrivacySettings(req, dto) {
        const userId = req.user.sub;
        return this.userSettingsService.updatePrivacySettings(userId, dto);
    }
    getNotificationSettings(req) {
        const userId = req.user.sub;
        return this.userSettingsService.getNotificationSettings(userId);
    }
    updateNotificationSettings(req, dto) {
        const userId = req.user.sub;
        return this.userSettingsService.updateNotificationSettings(userId, dto);
    }
    deactivateAccount(req, dto) {
        const userId = req.user.sub;
        return this.userAccountService.deactivateAccount(userId, dto);
    }
    reactivateAccount(req, dto) {
        const userId = req.user.sub;
        return this.userAccountService.reactivateAccount(userId);
    }
    changePassword(req, dto) {
        const userId = req.user.sub;
        return this.userAccountService.changePassword(userId, dto.currentPassword, dto.newPassword);
    }
    deleteAccount(req, dto) {
        const userId = req.user.sub;
        return this.userAccountService.deleteAccount(userId, dto);
    }
    exportUserData(req, category) {
        const userId = req.user.sub;
        return this.userAccountService.exportUserData(userId, category || 'all');
    }
    getBlockedUsers(req, page, limit) {
        const userId = req.user.sub;
        return this.userBlockingService.getBlockedUsers(userId, page, limit);
    }
    getCrisisResources() {
        return this.userResourcesService.getCrisisResources();
    }
    getCommunityGuidelines() {
        return this.userResourcesService.getCommunityGuidelines();
    }
    submitHarassmentReport(req, dto) {
        const userId = req.user.sub;
        return this.harassmentReportService.createReport(userId, dto);
    }
    getMyHarassmentReports(req, page, limit) {
        const userId = req.user.sub;
        return this.harassmentReportService.getUserReports(userId, page, limit);
    }
    getHarassmentReportByReference(req, referenceNumber) {
        const userId = req.user.sub;
        return this.harassmentReportService.getReportByReference(userId, referenceNumber);
    }
    getHarassmentReportById(req, id) {
        const userId = req.user.sub;
        return this.harassmentReportService.getReportById(userId, id);
    }
    getUserById(req, userId) {
        const currentUserId = req.user.sub;
        return this.userProfileService.getUserProfileById(userId, currentUserId);
    }
    getUserStats(userId) {
        return this.userProfileService.getUserStats(userId);
    }
    getUserBadges(userId) {
        return this.userProfileService.getUserBadges(userId);
    }
    getUserActivity(userId, type, page, limit) {
        return this.userProfileService.getUserActivity(userId, type, page, limit);
    }
    blockUser(req, targetUserId, dto) {
        const userId = req.user.sub;
        return this.userBlockingService.blockUser(userId, targetUserId, dto);
    }
    unblockUser(req, targetUserId) {
        const userId = req.user.sub;
        return this.userBlockingService.unblockUser(userId, targetUserId);
    }
    getBlockStatus(req, targetUserId) {
        const userId = req.user.sub;
        return this.userBlockingService.getBlockStatus(userId, targetUserId);
    }
};
exports.UserController = UserController;
__decorate([
    (0, common_1.Get)('profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user profile' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Patch)('profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update current user profile' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.UpdateProfileDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdateProfileDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Patch)('avatar'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user avatar' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.UpdateAvatarDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdateAvatarDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "updateAvatar", null);
__decorate([
    (0, common_1.Patch)('username'),
    (0, swagger_1.ApiOperation)({ summary: 'Update username' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.UpdateUsernameDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdateUsernameDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "updateUsername", null);
__decorate([
    (0, common_1.Get)('settings/privacy'),
    (0, swagger_1.ApiOperation)({ summary: 'Get privacy settings' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getPrivacySettings", null);
__decorate([
    (0, common_1.Put)('settings/privacy'),
    (0, swagger_1.ApiOperation)({ summary: 'Update privacy settings' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.UpdatePrivacySettingsDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdatePrivacySettingsDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "updatePrivacySettings", null);
__decorate([
    (0, common_1.Get)('settings/notifications'),
    (0, swagger_1.ApiOperation)({ summary: 'Get notification settings' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getNotificationSettings", null);
__decorate([
    (0, common_1.Put)('settings/notifications'),
    (0, swagger_1.ApiOperation)({ summary: 'Update notification settings' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.UpdateNotificationSettingsDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdateNotificationSettingsDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "updateNotificationSettings", null);
__decorate([
    (0, common_1.Post)('account/deactivate'),
    (0, swagger_1.ApiOperation)({ summary: 'Deactivate account' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.DeactivateAccountDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.DeactivateAccountDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "deactivateAccount", null);
__decorate([
    (0, common_1.Post)('account/reactivate'),
    (0, swagger_1.ApiOperation)({ summary: 'Reactivate account' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.ReactivateAccountDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.ReactivateAccountDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "reactivateAccount", null);
__decorate([
    (0, common_1.Post)('account/change-password'),
    (0, swagger_1.ApiOperation)({ summary: 'Change account password' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.ChangePasswordDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.ChangePasswordDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Delete)('account'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete account permanently' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.DeleteAccountDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.DeleteAccountDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "deleteAccount", null);
__decorate([
    (0, common_1.Get)('account/export'),
    (0, swagger_1.ApiOperation)({ summary: 'Export user data by category' }),
    (0, swagger_1.ApiQuery)({
        name: 'category',
        required: false,
        enum: ['all', 'profile', 'posts', 'comments', 'connections', 'activity'],
        description: 'Data category to export (default: all)',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "exportUserData", null);
__decorate([
    (0, common_1.Get)('blocked'),
    (0, swagger_1.ApiOperation)({ summary: 'Get blocked users' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getBlockedUsers", null);
__decorate([
    (0, common_1.Get)('resources/crisis'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get crisis resources',
        description: 'Get mental health, workplace, identity-specific, and self-care crisis resources',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getCrisisResources", null);
__decorate([
    (0, common_1.Get)('resources/community-guidelines'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get community guidelines',
        description: 'Get community guidelines including sections on respect, safety, communication, prohibited behavior, mentorship, content, and reporting',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getCommunityGuidelines", null);
__decorate([
    (0, common_1.Post)('reports/harassment'),
    (0, swagger_1.ApiOperation)({
        summary: 'Submit a harassment report',
        description: 'Submit a new harassment or safety incident report',
    }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.CreateHarassmentReportDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.CreateHarassmentReportDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "submitHarassmentReport", null);
__decorate([
    (0, common_1.Get)('reports/harassment'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get my harassment reports',
        description: 'Get list of harassment reports submitted by the current user',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getMyHarassmentReports", null);
__decorate([
    (0, common_1.Get)('reports/harassment/reference/:referenceNumber'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get harassment report by reference number',
        description: 'Look up a harassment report using its reference number',
    }),
    (0, swagger_1.ApiParam)({ name: 'referenceNumber', description: 'Report reference number (e.g., HR-XXXXX-XXXX)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('referenceNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getHarassmentReportByReference", null);
__decorate([
    (0, common_1.Get)('reports/harassment/:id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get harassment report by ID',
        description: 'Get a specific harassment report by its ID',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Report ID' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getHarassmentReportById", null);
__decorate([
    (0, common_1.Get)(':userId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user profile by ID' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: 'User ID' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getUserById", null);
__decorate([
    (0, common_1.Get)(':userId/stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user statistics' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: 'User ID' }),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getUserStats", null);
__decorate([
    (0, common_1.Get)(':userId/badges'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user badges' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: 'User ID' }),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getUserBadges", null);
__decorate([
    (0, common_1.Get)(':userId/activity'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user activity' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: 'User ID' }),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, enum: ['posts', 'comments', 'topics', 'nooks', 'all'] }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Query)('type')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getUserActivity", null);
__decorate([
    (0, common_1.Post)(':userId/block'),
    (0, swagger_1.ApiOperation)({ summary: 'Block a user' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: 'User ID to block' }),
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.BlockUserDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_profile_dto_1.BlockUserDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "blockUser", null);
__decorate([
    (0, common_1.Delete)(':userId/block'),
    (0, swagger_1.ApiOperation)({ summary: 'Unblock a user' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: 'User ID to unblock' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "unblockUser", null);
__decorate([
    (0, common_1.Get)(':userId/block/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Check block status with a user' }),
    (0, swagger_1.ApiParam)({ name: 'userId', description: 'User ID to check' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getBlockStatus", null);
exports.UserController = UserController = __decorate([
    (0, swagger_1.ApiTags)('User'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('user'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [user_service_1.UserService,
        user_profile_service_1.UserProfileService,
        user_settings_service_1.UserSettingsService,
        user_account_service_1.UserAccountService,
        user_blocking_service_1.UserBlockingService,
        user_resources_service_1.UserResourcesService,
        harassment_report_service_1.HarassmentReportService])
], UserController);
//# sourceMappingURL=user.controller.js.map