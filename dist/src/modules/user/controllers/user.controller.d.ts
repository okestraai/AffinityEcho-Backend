import { UserService } from '../services/user.service';
import { UserProfileService } from '../services/user-profile.service';
import { UserSettingsService } from '../services/user-settings.service';
import { UserAccountService } from '../services/user-account.service';
import { UserBlockingService } from '../services/user-blocking.service';
import { UserResourcesService } from '../services/user-resources.service';
import { HarassmentReportService } from '../services/harassment-report.service';
import { UpdateProfileDto, UpdateAvatarDto, UpdateUsernameDto, UpdatePrivacySettingsDto, UpdateNotificationSettingsDto, DeactivateAccountDto, ReactivateAccountDto, DeleteAccountDto, BlockUserDto, CreateHarassmentReportDto, ChangePasswordDto } from '../dto/update-profile.dto';
export declare class UserController {
    private userService;
    private userProfileService;
    private userSettingsService;
    private userAccountService;
    private userBlockingService;
    private userResourcesService;
    private harassmentReportService;
    constructor(userService: UserService, userProfileService: UserProfileService, userSettingsService: UserSettingsService, userAccountService: UserAccountService, userBlockingService: UserBlockingService, userResourcesService: UserResourcesService, harassmentReportService: HarassmentReportService);
    getProfile(user: any): Promise<{
        id: any;
        username: any;
        email: any;
        first_name_encrypted: any;
        last_name_encrypted: any;
        avatar: any;
        bio: any;
        job_title: any;
        location: any;
        years_experience: any;
        skills: any;
        linkedin_url: any;
        privacy_level: any;
        is_willing_to_mentor: any;
        has_completed_onboarding: any;
        reputation_score: any;
        total_posts: any;
        total_comments: any;
        helpful_votes_received: any;
        mentorship_sessions_completed: any;
        successful_referrals: any;
        company_type: any;
        race_encrypted: any;
        gender_encrypted: any;
        career_level_encrypted: any;
        company_encrypted: any;
        affinity_tags_encrypted: any;
        is_active_mentor: any;
        is_active_mentee: any;
        mentoring_as: any;
        mentor_bio: any;
        mentor_expertise: any;
        mentor_industries: any;
        mentor_availability: any;
        mentor_response_time: any;
        mentor_style: any;
        mentor_languages: any;
        mentor_hourly_rate: any;
        mentor_profile_created_at: any;
        mentee_bio: any;
        mentee_goals: any;
        mentee_interests: any;
        mentee_industries: any;
        mentee_availability: any;
        mentee_urgency: any;
        mentee_topic: any;
        mentored_style: any;
        mentee_languages: any;
        mentee_profile_created_at: any;
        communication_method: any;
        badges: any;
        created_at: any;
        updated_at: any;
        last_active_at: any;
        is_deleted: any;
        is_deactivated: any;
    }>;
    updateProfile(user: any, updates: UpdateProfileDto): Promise<{
        id: any;
        username: any;
        email: any;
        first_name_encrypted: any;
        last_name_encrypted: any;
        avatar: any;
        bio: any;
        job_title: any;
        location: any;
        years_experience: any;
        skills: any;
        linkedin_url: any;
        privacy_level: any;
        is_willing_to_mentor: any;
        has_completed_onboarding: any;
        reputation_score: any;
        total_posts: any;
        total_comments: any;
        helpful_votes_received: any;
        mentorship_sessions_completed: any;
        successful_referrals: any;
        company_type: any;
        race_encrypted: any;
        gender_encrypted: any;
        career_level_encrypted: any;
        company_encrypted: any;
        affinity_tags_encrypted: any;
        is_active_mentor: any;
        is_active_mentee: any;
        mentoring_as: any;
        mentor_bio: any;
        mentor_expertise: any;
        mentor_industries: any;
        mentor_availability: any;
        mentor_response_time: any;
        mentor_style: any;
        mentor_languages: any;
        mentor_hourly_rate: any;
        mentor_profile_created_at: any;
        mentee_bio: any;
        mentee_goals: any;
        mentee_interests: any;
        mentee_industries: any;
        mentee_availability: any;
        mentee_urgency: any;
        mentee_topic: any;
        mentored_style: any;
        mentee_languages: any;
        mentee_profile_created_at: any;
        communication_method: any;
        badges: any;
        created_at: any;
        updated_at: any;
        last_active_at: any;
        is_deleted: any;
        is_deactivated: any;
    }>;
    updateAvatar(req: any, dto: UpdateAvatarDto): Promise<{
        success: boolean;
        data: {
            avatar: any;
        };
        message: string;
    }>;
    updateUsername(req: any, dto: UpdateUsernameDto): Promise<{
        success: boolean;
        data: {
            username: any;
        };
        message: string;
    }>;
    getPrivacySettings(req: any): Promise<{
        success: boolean;
        data: {
            profileVisibility: any;
            showEmail: any;
            showCompany: any;
            showLocation: any;
            allowMessagesFrom: any;
            showActivity: any;
            showConnections: any;
        };
    }>;
    updatePrivacySettings(req: any, dto: UpdatePrivacySettingsDto): Promise<{
        success: boolean;
        message: string;
    }>;
    getNotificationSettings(req: any): Promise<{
        success: boolean;
        data: {
            emailNotifications: any;
            pushNotifications: any;
            notifyOnComment: any;
            notifyOnLike: any;
            notifyOnFollow: any;
            notifyOnMention: any;
            notifyOnMessage: any;
            notifyOnConnectionRequest: any;
            digestFrequency: any;
        };
    }>;
    updateNotificationSettings(req: any, dto: UpdateNotificationSettingsDto): Promise<{
        success: boolean;
        message: string;
    }>;
    deactivateAccount(req: any, dto: DeactivateAccountDto): Promise<{
        success: boolean;
        message: string;
    }>;
    reactivateAccount(req: any, dto: ReactivateAccountDto): Promise<{
        success: boolean;
        message: string;
    }>;
    changePassword(req: any, dto: ChangePasswordDto): Promise<{
        success: boolean;
        message: string;
    }>;
    deleteAccount(req: any, dto: DeleteAccountDto): Promise<{
        success: boolean;
        message: string;
    }>;
    exportUserData(req: any, category?: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    getBlockedUsers(req: any, page?: number, limit?: number): Promise<{
        success: boolean;
        data: {
            id: any;
            blockedAt: any;
            reason: any;
            user: {
                id: any;
                username: any;
                avatar: any;
                bio: any;
            };
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            hasMore: boolean;
        };
    }>;
    getCrisisResources(): {
        success: boolean;
        data: {
            emergency: {
                title: string;
                description: string;
                number: string;
                available: string;
            };
            categories: ({
                id: string;
                title: string;
                icon: string;
                resources: ({
                    name: string;
                    description: string;
                    phone: string;
                    text: string;
                    website: string;
                    available: string;
                    languages: string[];
                } | {
                    name: string;
                    description: string;
                    text: string;
                    website: string;
                    available: string;
                    languages: string[];
                    phone?: undefined;
                } | {
                    name: string;
                    description: string;
                    phone: string;
                    website: string;
                    available: string;
                    languages: string[];
                    text?: undefined;
                })[];
            } | {
                id: string;
                title: string;
                icon: string;
                resources: ({
                    name: string;
                    description: string;
                    phone: string;
                    text: string;
                    website: string;
                    available: string;
                    languages: string[];
                } | {
                    name: string;
                    description: string;
                    phone: string;
                    website: string;
                    available: string;
                    languages: string[];
                    text?: undefined;
                } | {
                    name: string;
                    description: string;
                    website: string;
                    available: string;
                    languages: string[];
                    phone?: undefined;
                    text?: undefined;
                })[];
            } | {
                id: string;
                title: string;
                icon: string;
                resources: {
                    name: string;
                    description: string;
                    tips: string[];
                }[];
            })[];
            disclaimer: string;
        };
    };
    getCommunityGuidelines(): {
        success: boolean;
        data: {
            title: string;
            lastUpdated: string;
            introduction: string;
            sections: {
                id: string;
                title: string;
                icon: string;
                description: string;
                guidelines: string[];
            }[];
            reportingInfo: {
                title: string;
                description: string;
                methods: {
                    method: string;
                    description: string;
                }[];
            };
            acknowledgment: string;
        };
    };
    submitHarassmentReport(req: any, dto: CreateHarassmentReportDto): Promise<{
        success: boolean;
        data: {
            id: any;
            referenceNumber: any;
            status: any;
            immediateRisk: any;
            createdAt: any;
        };
        message: string;
    }>;
    getMyHarassmentReports(req: any, page?: number, limit?: number): Promise<{
        success: boolean;
        data: {
            reports: {
                id: any;
                referenceNumber: any;
                incidentType: any;
                description: any;
                date: any;
                location: any;
                reporterType: any;
                immediateRisk: any;
                status: any;
                createdAt: any;
                updatedAt: any;
            }[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    getHarassmentReportByReference(req: any, referenceNumber: string): Promise<{
        success: boolean;
        data: {
            id: any;
            referenceNumber: any;
            incidentType: any;
            description: any;
            date: any;
            location: any;
            witnesses: any;
            evidence: any;
            reporterType: any;
            contactEmail: any;
            immediateRisk: any;
            status: any;
            createdAt: any;
            updatedAt: any;
            resolvedAt: any;
        };
    }>;
    getHarassmentReportById(req: any, id: string): Promise<{
        success: boolean;
        data: {
            id: any;
            referenceNumber: any;
            incidentType: any;
            description: any;
            date: any;
            location: any;
            witnesses: any;
            evidence: any;
            reporterType: any;
            contactEmail: any;
            immediateRisk: any;
            status: any;
            createdAt: any;
            updatedAt: any;
            resolvedAt: any;
        };
    }>;
    getUserById(req: any, userId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    getUserStats(userId: string): Promise<{
        success: boolean;
        data: {
            postsCreated: number;
            commentsPosted: number;
            helpfulReactions: number;
            reputationScore: number;
            topicsCreated: number;
            nooksJoined: number;
            mentorshipSessions: any;
            referralsMade: number;
            followersCount: number;
        };
    }>;
    getUserBadges(userId: string): Promise<{
        success: boolean;
        data: {
            badges: {
                id: string;
                name: string;
                description: string;
                icon: string;
                earned: boolean;
            }[];
            earnedCount: number;
            totalCount: number;
        };
    }>;
    getUserActivity(userId: string, type?: 'posts' | 'comments' | 'topics' | 'nooks' | 'all', page?: number, limit?: number): Promise<{
        success: boolean;
        data: any[];
        pagination: {
            page: number;
            limit: number;
            hasMore: boolean;
        };
    }>;
    blockUser(req: any, targetUserId: string, dto: BlockUserDto): Promise<{
        success: boolean;
        message: string;
    }>;
    unblockUser(req: any, targetUserId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getBlockStatus(req: any, targetUserId: string): Promise<{
        success: boolean;
        data: {
            isBlocked: boolean;
        };
    }>;
}
