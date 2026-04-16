import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import logger from '../../../common/utils/logger.util';
import {
  CreateReferralDto,
  UpdateReferralDto,
  GetReferralsQueryDto,
} from '../dto/referral.dto';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class ReferralService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Get referrals with optimized queries
   */

  async getReferrals(userId: string, query: GetReferralsQueryDto) {
    const startTime = Date.now();
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Fetching referrals', { userId, query, correlationId });

    try {
      const interactionsPromise = this.getUserInteractions(userId);

      const limit = query.limit || 50;
      const offset = query.offset || 0;

      // Build the query without the initial limit
      // Try simplified query first to isolate the issue
      let postsQuery = this.admin
        .from('referral_posts')
        .select('*', { count: 'exact' })
        .order('last_activity_at', { ascending: false });

      // Apply filters
      if (query.type && query.type !== 'all') {
        postsQuery = postsQuery.eq('type', query.type);
      }
      if (query.status && query.status !== 'all') {
        postsQuery = postsQuery.eq('status', query.status);
      }
      if (query.scope && query.scope !== 'all') {
        postsQuery = postsQuery.eq('scope', query.scope);
      }

      // Apply pagination - choose ONE method
      if (query.cursor) {
        // Cursor-based pagination
        postsQuery = postsQuery
          .lt('last_activity_at', query.cursor)
          .limit(limit);
      } else {
        // Offset-based pagination
        postsQuery = postsQuery.range(offset, offset + limit - 1);
      }

      const { data: posts, error: postsError, count } = await postsQuery;

      if (postsError) {
        // Better error logging - log the full error object
        console.error('POSTS QUERY FAILED:', {
          message: postsError.message,
          details: postsError.details,
          hint: postsError.hint,
          code: postsError.code,
          fullError: JSON.stringify(postsError, null, 2),
        });

        logger.error('Posts query failed', {
          error: {
            message: postsError.message,
            details: postsError.details,
            hint: postsError.hint,
            code: postsError.code,
          },
          correlationId,
        });

        throw new Error(
          `Failed to fetch posts: ${postsError.message || postsError.details || 'Unknown error'}`,
        );
      }

      if (!posts?.length) {
        return {
          success: true,
          data: [],
          pagination: { total: 0, limit, offset, hasMore: false, cursor: null },
          metadata: { correlationId, duration: Date.now() - startTime },
        };
      }

      // Interactions
      const { likedIds, bookmarkedIds } = await interactionsPromise;

      // Transform posts
      const transformedPosts = await Promise.all(
        posts.map(async (post: any) => {
          const profile = post.author;

          const [title, company, jobTitle, description] = await Promise.all([
            this.encryption.decrypt(post.title_encrypted),
            this.encryption.decrypt(post.company_encrypted),
            post.job_title_encrypted
              ? this.encryption.decrypt(post.job_title_encrypted)
              : null,
            this.encryption.decrypt(post.description_encrypted),
          ]);

          return {
            id: post.id,
            user_id: post.user_id,
            type: post.type,
            title,
            company,
            jobTitle,
            jobLink: post.job_link,
            description,
            scope: post.scope,
            status: post.status,
            availableSlots: post.available_slots,
            totalSlots: post.total_slots,
            tags: post.tags,
            requiredSkills: post.required_skills,
            preferredExperience: post.preferred_experience,
            viewsCount: post.views_count,
            likesCount: post.likes_count,
            commentsCount: post.comments_count,
            bookmarksCount: post.bookmarks_count,
            connectionRequestsCount: post.connection_requests_count,
            createdAt: post.created_at,
            updatedAt: post.updated_at,
            lastActivityAt: post.last_activity_at,
            expiresAt: post.expires_at,
            author: profile
              ? {
                  id: profile.id,
                  username: profile.username,
                  display_name: profile.username,
                  avatar: profile.avatar,
                  jobTitle: profile.job_title,
                  company: await this.encryption.decrypt(
                    profile.company_encrypted,
                  ),
                  bio: profile.bio,
                  skills: profile.skills,
                  yearsExperience: profile.years_experience,
                  is_company_verified: profile.is_company_verified || false,
                }
              : null,
            isLiked: likedIds.has(post.id),
            isBookmarked: bookmarkedIds.has(post.id),
          };
        }),
      );

      // Apply identity reveal to author display names (including own posts)
      const allAuthorUserIds = transformedPosts
        .filter((p) => p.author)
        .map((p) => p.user_id);
      const otherAuthorUserIds = allAuthorUserIds.filter((id) => id !== userId);
      const revealedIds =
        otherAuthorUserIds.length > 0
          ? await this.identityReveal.getRevealedUserIds(
              userId,
              otherAuthorUserIds,
            )
          : new Set<string>();

      // Collect IDs that need encrypted name lookup (own + revealed)
      const needNameIds = [
        ...new Set(
          allAuthorUserIds.filter((id) => id === userId || revealedIds.has(id)),
        ),
      ];

      if (needNameIds.length > 0) {
        const { data: profiles } = await this.admin
          .from('user_profiles')
          .select('id, first_name_encrypted, last_name_encrypted')
          .in('id', needNameIds);

        const nameMap = new Map<
          string,
          { first: string | null; last: string | null }
        >();
        (profiles || []).forEach((p: any) => {
          nameMap.set(p.id, {
            first: p.first_name_encrypted,
            last: p.last_name_encrypted,
          });
        });

        transformedPosts.forEach((post) => {
          if (
            post.author &&
            (post.user_id === userId || revealedIds.has(post.user_id))
          ) {
            const names = nameMap.get(post.user_id);
            if (names) {
              const realName = this.identityReveal.decryptRealName(
                names.first,
                names.last,
              );
              if (realName) post.author.display_name = realName;
            }
          }
        });
      }

      const result = {
        success: true,
        data: transformedPosts,
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: count ? offset + limit < count : false,
          cursor:
            transformedPosts.length > 0
              ? transformedPosts[transformedPosts.length - 1].lastActivityAt
              : null,
        },
        metadata: { correlationId, duration: Date.now() - startTime },
      };

      logger.info('Referrals fetched successfully', {
        userId,
        correlationId,
        postCount: transformedPosts.length,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (err: any) {
      logger.error(MSG.REFERRAL.FETCH_FAILED, {
        error: err.message || String(err),
        stack: err.stack,
        userId,
        correlationId,
        duration: Date.now() - startTime,
      });
      throw new BadRequestException(MSG.REFERRAL.FETCH_FAILED);
    }
  }
  /**
   * Helper method to get user interactions in a single query
   */
  private async getUserInteractions(userId: string): Promise<{
    likedIds: Set<string>;
    bookmarkedIds: Set<string>;
  }> {
    try {
      // Get both likes and bookmarks in a single query if possible, or use Promise.all
      const [likesResult, bookmarksResult] = await Promise.all([
        this.admin
          .from('referral_likes')
          .select('referral_post_id')
          .eq('user_id', userId),
        this.admin
          .from('referral_bookmarks')
          .select('referral_post_id')
          .eq('user_id', userId),
      ]);

      const likedIds = new Set<string>(
        likesResult.data?.map((l: any) => l.referral_post_id) || [],
      );
      const bookmarkedIds = new Set<string>(
        bookmarksResult.data?.map((b: any) => b.referral_post_id) || [],
      );

      return { likedIds, bookmarkedIds };
    } catch (error) {
      logger.warn('Failed to fetch user interactions', { error, userId });
      return { likedIds: new Set<string>(), bookmarkedIds: new Set<string>() };
    }
  }

  /**
   * Get referral by ID
   */
  async getReferralById(userId: string, referralId: string) {
    const startTime = Date.now();
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Fetching referral by ID', {
      userId,
      referralId,
      correlationId,
    });

    try {
      // Use a single query with joins instead of multiple sequential queries
      const { data: result, error } = await this.admin
        .from('referral_posts')
        .select(
          `
        *,
        user_profiles!inner(*),
        referral_likes!left(id).filter(user_id.eq.${userId}),
        referral_bookmarks!left(id).filter(user_id.eq.${userId})
      `,
        )
        .eq('id', referralId)
        .single();

      if (error || !result) {
        throw new NotFoundException(MSG.REFERRAL.NOT_FOUND);
      }

      // Add type checking for the result
      if (typeof result !== 'object' || result === null) {
        throw new NotFoundException(MSG.REFERRAL.NOT_FOUND);
      }

      // Explicitly type the destructuring
      const postData = result;
      const {
        referral_likes = [],
        referral_bookmarks = [],
        user_profiles: profile = null,
        ...restPost
      } = postData;

      // Ensure we have valid post data
      const post = restPost;

      // Decrypt fields in parallel
      const [title, company, jobTitle, description] = await Promise.all([
        Promise.resolve(this.encryption.decrypt(post.title_encrypted)),
        Promise.resolve(this.encryption.decrypt(post.company_encrypted)),
        post.job_title_encrypted
          ? Promise.resolve(this.encryption.decrypt(post.job_title_encrypted))
          : Promise.resolve(null),
        Promise.resolve(this.encryption.decrypt(post.description_encrypted)),
      ]);

      const response = {
        success: true,
        data: {
          id: post.id,
          userId: post.user_id,
          type: post.type,
          title,
          company,
          jobTitle,
          jobLink: post.job_link,
          description,
          scope: post.scope,
          status: post.status,
          availableSlots: post.available_slots,
          totalSlots: post.total_slots,
          tags: post.tags,
          requiredSkills: post.required_skills,
          preferredExperience: post.preferred_experience,
          viewsCount: post.views_count,
          likesCount: post.likes_count,
          commentsCount: post.comments_count,
          bookmarksCount: post.bookmarks_count,
          connectionRequestsCount: post.connection_requests_count,
          createdAt: post.created_at,
          updatedAt: post.updated_at,
          lastActivityAt: post.last_activity_at,
          expiresAt: post.expires_at,
          author: profile
            ? await (async () => {
                let displayName = profile.username;
                const isOwnPost = profile.id === userId;
                const revealed =
                  isOwnPost ||
                  (await this.identityReveal.isRevealed(userId, profile.id));
                if (revealed) {
                  const realName = this.identityReveal.decryptRealName(
                    profile.first_name_encrypted,
                    profile.last_name_encrypted,
                  );
                  if (realName) displayName = realName;
                }
                return {
                  id: profile.id,
                  username: profile.username,
                  display_name: displayName,
                  avatar: profile.avatar,
                  jobTitle: profile.job_title,
                  company: this.encryption.decrypt(profile.company_encrypted),
                  bio: profile.bio,
                  skills: profile.skills,
                  yearsExperience: profile.years_experience,
                  is_company_verified: profile.is_company_verified || false,
                };
              })()
            : null,
          isLiked: Array.isArray(referral_likes) && referral_likes.length > 0,
          isBookmarked:
            Array.isArray(referral_bookmarks) && referral_bookmarks.length > 0,
        },
        metadata: {
          correlationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };

      logger.info('Referral fetched successfully', {
        referralId,
        correlationId,
        duration: `${Date.now() - startTime}ms`,
      });

      return response;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error(MSG.REFERRAL.FETCH_FAILED, {
        error,
        referralId,
        userId,
        correlationId,
        duration: `${Date.now() - startTime}ms`,
      });
      throw new BadRequestException(MSG.REFERRAL.FETCH_FAILED);
    }
  }

  /**
   * Create referral
   */
  async createReferral(userId: string, dto: CreateReferralDto) {
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Creating referral', { userId, type: dto.type, correlationId });

    try {
      const encryptedData = {
        user_id: userId,
        type: dto.type,
        title_encrypted: this.encryption.encrypt(dto.title),
        company_encrypted: this.encryption.encrypt(dto.company),
        job_title_encrypted: dto.jobTitle
          ? this.encryption.encrypt(dto.jobTitle)
          : null,
        job_link: dto.jobLink || null,
        description_encrypted: this.encryption.encrypt(dto.description),
        scope: dto.scope,
        status: 'open',
        available_slots: dto.availableSlots || null,
        total_slots: dto.totalSlots || null,
        tags: dto.tags || [],
        required_skills: dto.requiredSkills || [],
        preferred_experience: dto.preferredExperience || null,
        affinity_groups: dto.affinityGroups || [],
        last_activity_at: new Date().toISOString(),
      };

      const { data, error } = await this.admin
        .from('referral_posts')
        .insert([encryptedData])
        .select()
        .single();

      if (error) throw error;

      // Update user stats
      await this.admin.rpc('increment_user_posts', { user_id: userId });

      return {
        success: true,
        data: {
          id: data.id,
          type: data.type,
          status: data.status,
          createdAt: data.created_at,
        },
        message: MSG.REFERRAL.CREATED,
        metadata: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error(MSG.REFERRAL.CREATE_FAILED, {
        error,
        userId,
        correlationId,
      });
      throw new BadRequestException(MSG.REFERRAL.CREATE_FAILED);
    }
  }

  /**
   * Update referral
   */
  async updateReferral(
    userId: string,
    referralId: string,
    dto: UpdateReferralDto,
  ) {
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Updating referral', { userId, referralId, correlationId });

    try {
      // Check ownership
      const { data: existing } = await this.admin
        .from('referral_posts')
        .select('user_id')
        .eq('id', referralId)
        .single();

      if (!existing) throw new NotFoundException(MSG.REFERRAL.NOT_FOUND);
      if (existing.user_id !== userId)
        throw new ForbiddenException(MSG.REFERRAL.NOT_AUTHORIZED);

      const updateData: any = {
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      };

      if (dto.title)
        updateData.title_encrypted = this.encryption.encrypt(dto.title);
      if (dto.description)
        updateData.description_encrypted = this.encryption.encrypt(
          dto.description,
        );
      if (dto.status) updateData.status = dto.status;
      if (dto.availableSlots !== undefined)
        updateData.available_slots = dto.availableSlots;
      if (dto.tags) updateData.tags = dto.tags;

      const { data, error } = await this.admin
        .from('referral_posts')
        .update(updateData)
        .eq('id', referralId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: { id: data.id, updatedAt: data.updated_at },
        message: MSG.REFERRAL.UPDATED,
        metadata: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      logger.error(MSG.REFERRAL.UPDATE_FAILED, {
        error,
        userId,
        referralId,
        correlationId,
      });
      throw new BadRequestException(MSG.REFERRAL.UPDATE_FAILED);
    }
  }

  /**
   * Delete referral
   */
  async deleteReferral(userId: string, referralId: string) {
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Deleting referral', { userId, referralId, correlationId });

    try {
      const { data: existing } = await this.admin
        .from('referral_posts')
        .select('user_id')
        .eq('id', referralId)
        .single();

      if (!existing) throw new NotFoundException(MSG.REFERRAL.NOT_FOUND);
      if (existing.user_id !== userId)
        throw new ForbiddenException(MSG.REFERRAL.NOT_AUTHORIZED);

      const { error } = await this.admin
        .from('referral_posts')
        .delete()
        .eq('id', referralId);

      if (error) throw error;

      return {
        success: true,
        message: MSG.REFERRAL.DELETED,
        metadata: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      logger.error(MSG.REFERRAL.DELETE_FAILED, {
        error,
        userId,
        referralId,
        correlationId,
      });
      throw new BadRequestException(MSG.REFERRAL.DELETE_FAILED);
    }
  }

  /**
   * Increment view count
   */
  async incrementViewCount(referralId: string) {
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      await this.admin.rpc('increment_referral_views', {
        referral_id: referralId,
      });

      const { data } = await this.admin
        .from('referral_posts')
        .select('views_count')
        .eq('id', referralId)
        .single();

      if (!data) {
        return { success: true, data: { viewsCount: 0 } };
      }

      return {
        success: true,
        data: { viewsCount: data.views_count },
        metadata: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error(MSG.REFERRAL.VIEW_FAILED, {
        error,
        referralId,
        correlationId,
      });
      throw new BadRequestException(MSG.REFERRAL.VIEW_FAILED);
    }
  }

  /**
   * Search referrals with optimization
   */
  async searchReferrals(userId: string, params: any) {
    const startTime = Date.now();
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Searching referrals', { userId, params, correlationId });

    try {
      const query = this.admin
        .from('referral_posts')
        .select('*')
        .eq('status', 'open');

      // Get all posts first
      const { data: allPosts, error } = await query;

      if (error) throw error;

      // Decrypt and filter in memory for text search
      const filteredPosts = await Promise.all(
        allPosts.map(async (post: any) => {
          const [title, company, description] = await Promise.all([
            Promise.resolve(
              this.encryption.decrypt(post.title_encrypted).toLowerCase(),
            ),
            Promise.resolve(
              this.encryption.decrypt(post.company_encrypted).toLowerCase(),
            ),
            Promise.resolve(
              this.encryption.decrypt(post.description_encrypted).toLowerCase(),
            ),
          ]);

          const tags = post.tags.map((t: string) => t.toLowerCase()).join(' ');
          return { post, title, company, description, tags };
        }),
      );

      // Apply search filters
      const results = filteredPosts
        .filter(({ title, company, description, tags, post }) => {
          if (params.query) {
            const searchLower = params.query.toLowerCase();
            if (
              !title.includes(searchLower) &&
              !company.includes(searchLower) &&
              !description.includes(searchLower) &&
              !tags.includes(searchLower)
            ) {
              return false;
            }
          }

          if (
            params.type &&
            params.type !== 'all' &&
            post.type !== params.type
          ) {
            return false;
          }

          if (params.companies && params.companies.length > 0) {
            const companyMatch = params.companies.some((c: string) =>
              company.includes(c.toLowerCase()),
            );
            if (!companyMatch) return false;
          }

          if (params.tags && params.tags.length > 0) {
            const tagMatch = params.tags.some((tag: string) =>
              post.tags
                .map((t: string) => t.toLowerCase())
                .includes(tag.toLowerCase()),
            );
            if (!tagMatch) return false;
          }

          if (params.skills && params.skills.length > 0) {
            const skillMatch = params.skills.some((skill: string) =>
              post.required_skills
                ?.map((s: string) => s.toLowerCase())
                .includes(skill.toLowerCase()),
            );
            if (!skillMatch) return false;
          }

          return true;
        })
        .map(({ post }) => post);

      // Get user profiles and interactions in parallel
      const userIds = [...new Set(results.map((p) => p.user_id))];
      const [profilesResult, interactionsResult] = await Promise.all([
        this.admin
          .from('user_profiles')
          .select(
            'id, username, avatar, job_title, company_encrypted, first_name_encrypted, last_name_encrypted, is_company_verified',
          )
          .in('id', userIds),
        this.getUserInteractions(userId),
      ]);

      const profiles = profilesResult.data || [];
      const { likedIds, bookmarkedIds } = interactionsResult;
      const profileMap = new Map<string, any>(
        profiles.map((p: any) => [p.id, p]),
      );

      // Get revealed IDs for identity reveal (own posts always get real name)
      const otherUserIds = userIds.filter((id) => id !== userId);
      const revealedIds = await this.identityReveal.getRevealedUserIds(
        userId,
        otherUserIds,
      );

      // Transform results
      const transformedResults = await Promise.all(
        results.map(async (post) => {
          const profile = profileMap.get(post.user_id);
          const [company, jobTitle] = await Promise.all([
            Promise.resolve(this.encryption.decrypt(post.company_encrypted)),
            post.job_title_encrypted
              ? Promise.resolve(
                  this.encryption.decrypt(post.job_title_encrypted),
                )
              : Promise.resolve(null),
          ]);

          let displayName = profile?.username;
          const isOwnPost = post.user_id === userId;
          if (profile && (isOwnPost || revealedIds.has(profile.id))) {
            const realName = this.identityReveal.decryptRealName(
              profile.first_name_encrypted,
              profile.last_name_encrypted,
            );
            if (realName) displayName = realName;
          }

          return {
            id: post.id,
            type: post.type,
            title: this.encryption.decrypt(post.title_encrypted),
            company,
            jobTitle,
            jobLink: post.job_link,
            description: this.encryption.decrypt(post.description_encrypted),
            scope: post.scope,
            status: post.status,
            availableSlots: post.available_slots,
            totalSlots: post.total_slots,
            tags: post.tags,
            requiredSkills: post.required_skills,
            viewsCount: post.views_count,
            likesCount: post.likes_count,
            commentsCount: post.comments_count,
            bookmarksCount: post.bookmarks_count,
            createdAt: post.created_at,
            lastActivityAt: post.last_activity_at,
            author: profile
              ? {
                  id: profile.id,
                  username: profile.username,
                  display_name: displayName,
                  avatar: profile.avatar,
                  jobTitle: profile.job_title,
                  company: this.encryption.decrypt(profile.company_encrypted),
                  is_company_verified: profile.is_company_verified || false,
                }
              : null,
            isLiked: likedIds.has(post.id),
            isBookmarked: bookmarkedIds.has(post.id),
          };
        }),
      );

      const result = {
        success: true,
        data: transformedResults,
        total: transformedResults.length,
        metadata: {
          correlationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };

      logger.info('Search completed', {
        userId,
        correlationId,
        duration: `${Date.now() - startTime}ms`,
        resultCount: transformedResults.length,
      });

      return result;
    } catch (error) {
      logger.error(MSG.REFERRAL.SEARCH_FAILED, {
        error,
        userId,
        correlationId,
      });
      throw new BadRequestException(MSG.REFERRAL.SEARCH_FAILED);
    }
  }

  /**
   * Get comprehensive statistics
   */
  async getStatistics(userId: string) {
    const startTime = Date.now();
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Fetching statistics', { userId, correlationId });

    try {
      // Execute multiple queries in parallel
      const [
        allPostsResult,
        companiesResult,
        connectionsResult,
        userPostsResult,
        userConnectionsSentResult,
        userConnectionsReceivedResult,
        userLikesResult,
        userBookmarksResult,
        userCommentsResult,
      ] = await Promise.all([
        this.admin
          .from('referral_posts')
          .select('id, type, status, views_count, user_id'),
        this.admin.from('referral_posts').select('company_encrypted'),
        this.admin
          .from('referral_connections')
          .select(
            'status, referral_submitted, interview_scheduled, offer_received',
          ),
        this.admin
          .from('referral_posts')
          .select('id, type, status, connection_requests_count')
          .eq('user_id', userId),
        this.admin
          .from('referral_connections')
          .select('status')
          .eq('sender_id', userId),
        this.admin
          .from('referral_connections')
          .select('status')
          .eq('receiver_id', userId),
        this.admin.from('referral_likes').select('id').eq('user_id', userId),
        this.admin
          .from('referral_bookmarks')
          .select('id')
          .eq('user_id', userId),
        this.admin.from('referral_comments').select('id').eq('user_id', userId),
      ]);

      const allPosts = allPostsResult.data || [];
      const companies = companiesResult.data || [];
      const connections = connectionsResult.data || [];
      const userPosts = userPostsResult.data || [];
      const userConnectionsSent = userConnectionsSentResult.data || [];
      const userConnectionsReceived = userConnectionsReceivedResult.data || [];
      const userLikes = userLikesResult.data || [];
      const userBookmarks = userBookmarksResult.data || [];
      const userComments = userCommentsResult.data || [];

      // Calculate statistics
      const totalPosts = allPosts.length;
      const openRequests = allPosts.filter(
        (p: any) => p.type === 'request' && p.status === 'open',
      ).length;
      const openOffers = allPosts.filter(
        (p: any) => p.type === 'offer' && p.status === 'open',
      ).length;
      const totalViews = allPosts.reduce(
        (sum: any, p: any) => sum + (p.views_count || 0),
        0,
      );

      const uniqueCompanies = new Set(
        companies.map((c: any) => this.encryption.decrypt(c.company_encrypted)),
      );

      const totalConnections = connections.length;
      const acceptedConnections = connections.filter(
        (c: any) => c.status === 'accepted',
      ).length;
      const successfulReferrals = connections.filter(
        (c: any) => c.referral_submitted,
      ).length;
      const interviewsScheduled = connections.filter(
        (c: any) => c.interview_scheduled,
      ).length;
      const offersReceived = connections.filter(
        (c: any) => c.offer_received,
      ).length;

      const userPostsCreated = userPosts.length;
      const userOpenPosts = userPosts.filter(
        (p: any) => p.status === 'open',
      ).length;

      const connectionsSent = userConnectionsSent.length;
      const connectionsReceived = userConnectionsReceived.length;
      const acceptedSent = userConnectionsSent.filter(
        (c: any) => c.status === 'accepted',
      ).length;
      const acceptedReceived = userConnectionsReceived.filter(
        (c: any) => c.status === 'accepted',
      ).length;
      const pendingSent = userConnectionsSent.filter(
        (c: any) => c.status === 'pending',
      ).length;
      const pendingReceived = userConnectionsReceived.filter(
        (c: any) => c.status === 'pending',
      ).length;

      const userSuccessRate =
        connectionsSent > 0 ? (acceptedSent / connectionsSent) * 100 : 0;

      const responseRate =
        connectionsReceived > 0
          ? ((acceptedReceived +
              userConnectionsReceived.filter(
                (c: any) => c.status === 'rejected',
              ).length) /
              connectionsReceived) *
            100
          : 0;

      const result = {
        success: true,
        data: {
          global: {
            totalPosts,
            openRequests,
            openOffers,
            totalCompanies: uniqueCompanies.size,
            totalViews,
            totalConnections,
            acceptedConnections,
            successfulReferrals,
            interviewsScheduled,
            offersReceived,
            successRate:
              totalConnections > 0
                ? ((successfulReferrals / totalConnections) * 100).toFixed(1)
                : '0.0',
          },
          user: {
            postsCreated: userPostsCreated,
            openPosts: userOpenPosts,
            connectionsSent,
            connectionsReceived,
            acceptedConnections: acceptedSent + acceptedReceived,
            pendingConnections: pendingSent + pendingReceived,
            likes: userLikes.length,
            bookmarks: userBookmarks.length,
            comments: userComments.length,
            successRate: userSuccessRate.toFixed(1),
            responseRate: responseRate.toFixed(1),
          },
          breakdown: {
            connectionsByStatus: {
              sent: {
                pending: pendingSent,
                accepted: acceptedSent,
                rejected: userConnectionsSent.filter(
                  (c: any) => c.status === 'rejected',
                ).length,
              },
              received: {
                pending: pendingReceived,
                accepted: acceptedReceived,
                rejected: userConnectionsReceived.filter(
                  (c: any) => c.status === 'rejected',
                ).length,
              },
            },
            postsByType: {
              requests: userPosts.filter((p: any) => p.type === 'request')
                .length,
              offers: userPosts.filter((p: any) => p.type === 'offer').length,
            },
          },
        },
        metadata: {
          correlationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };

      logger.info('Statistics fetched successfully', {
        userId,
        correlationId,
        duration: `${Date.now() - startTime}ms`,
      });

      return result;
    } catch (error) {
      logger.error(MSG.REFERRAL.STATS_FAILED, {
        error,
        userId,
        correlationId,
      });
      throw new BadRequestException(MSG.REFERRAL.STATS_FAILED);
    }
  }

  /**
   * Get user's referral activity
   */
  async getUserActivity(userId: string) {
    const startTime = Date.now();
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Fetching user activity', { userId, correlationId });

    try {
      // Execute queries in parallel
      const [
        postsResult,
        connectionsSentResult,
        connectionsReceivedResult,
        likesResult,
        bookmarksResult,
        commentsResult,
      ] = await Promise.all([
        this.admin
          .from('referral_posts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        this.admin
          .from('referral_connections')
          .select('id, referral_post_id, status, created_at, responded_at')
          .eq('sender_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        this.admin
          .from('referral_connections')
          .select('id, referral_post_id, status, created_at, responded_at')
          .eq('receiver_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        this.admin
          .from('referral_likes')
          .select('referral_post_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        this.admin
          .from('referral_bookmarks')
          .select('referral_post_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        this.admin
          .from('referral_comments')
          .select('id, referral_post_id, content, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const posts = postsResult.data || [];
      const connectionsSent = connectionsSentResult.data || [];
      const connectionsReceived = connectionsReceivedResult.data || [];
      const likes = likesResult.data || [];
      const bookmarks = bookmarksResult.data || [];
      const comments = commentsResult.data || [];

      // Transform posts with parallel decryption
      const transformedPosts = await Promise.all(
        posts.map(async (post: any) => {
          const [title, company] = await Promise.all([
            Promise.resolve(this.encryption.decrypt(post.title_encrypted)),
            Promise.resolve(this.encryption.decrypt(post.company_encrypted)),
          ]);

          return {
            id: post.id,
            type: post.type,
            title,
            company,
            status: post.status,
            scope: post.scope,
            availableSlots: post.available_slots,
            totalSlots: post.total_slots,
            viewsCount: post.views_count,
            likesCount: post.likes_count,
            commentsCount: post.comments_count,
            bookmarksCount: post.bookmarks_count,
            connectionRequestsCount: post.connection_requests_count,
            createdAt: post.created_at,
            lastActivityAt: post.last_activity_at,
          };
        }),
      );

      // Get recent activity timeline
      const recentActivity = [
        ...posts.map((p: any) => ({
          type: 'post_created',
          timestamp: p.created_at,
          data: {
            postId: p.id,
            title: this.encryption.decrypt(p.title_encrypted),
            postType: p.type,
          },
        })),
        ...connectionsSent.map((c: any) => ({
          type: 'connection_sent',
          timestamp: c.created_at,
          data: {
            connectionId: c.id,
            referralPostId: c.referral_post_id,
            status: c.status,
          },
        })),
        ...connectionsReceived.map((c: any) => ({
          type: 'connection_received',
          timestamp: c.created_at,
          data: {
            connectionId: c.id,
            referralPostId: c.referral_post_id,
            status: c.status,
          },
        })),
        ...likes.map((l: any) => ({
          type: 'post_liked',
          timestamp: l.created_at,
          data: {
            referralPostId: l.referral_post_id,
          },
        })),
        ...comments.map((c: any) => ({
          type: 'comment_posted',
          timestamp: c.created_at,
          data: {
            commentId: c.id,
            referralPostId: c.referral_post_id,
            preview: c.content.substring(0, 100),
          },
        })),
      ]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 30);

      // Calculate activity stats
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const postsThisMonth = posts.filter(
        (p: any) => new Date(p.created_at) > oneMonthAgo,
      ).length;

      const connectionsThisMonth = [
        ...connectionsSent,
        ...connectionsReceived,
      ].filter((c) => new Date(c.created_at) > oneMonthAgo).length;

      const engagementThisMonth = [...likes, ...comments].filter(
        (item) => new Date(item.created_at) > oneMonthAgo,
      ).length;

      const result = {
        success: true,
        data: {
          posts: transformedPosts,
          connections: {
            sent: connectionsSent,
            received: connectionsReceived,
            total: connectionsSent.length + connectionsReceived.length,
            pending:
              connectionsSent.filter((c: any) => c.status === 'pending')
                .length +
              connectionsReceived.filter((c: any) => c.status === 'pending')
                .length,
            accepted:
              connectionsSent.filter((c: any) => c.status === 'accepted')
                .length +
              connectionsReceived.filter((c: any) => c.status === 'accepted')
                .length,
          },
          engagement: {
            likes: likes.length,
            bookmarks: bookmarks.length,
            comments: comments.length,
            total: likes.length + bookmarks.length + comments.length,
          },
          recentActivity,
          activityStats: {
            postsThisMonth,
            connectionsThisMonth,
            engagementThisMonth,
          },
          summary: {
            totalPosts: posts.length,
            activePosts: posts.filter((p: any) => p.status === 'open').length,
            totalConnections:
              connectionsSent.length + connectionsReceived.length,
            totalEngagements: likes.length + bookmarks.length + comments.length,
            totalViews: posts.reduce(
              (sum: any, p: any) => sum + (p.views_count || 0),
              0,
            ),
            totalLikesReceived: posts.reduce(
              (sum: any, p: any) => sum + (p.likes_count || 0),
              0,
            ),
          },
        },
        metadata: {
          correlationId,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      };

      logger.info('User activity fetched successfully', {
        userId,
        correlationId,
        duration: `${Date.now() - startTime}ms`,
      });

      return result;
    } catch (error) {
      logger.error(MSG.REFERRAL.STATS_FAILED, {
        error,
        userId,
        correlationId,
      });
      throw new BadRequestException(MSG.REFERRAL.STATS_FAILED);
    }
  }
}
