import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import {
  CreateDirectRequestDto,
  RespondToDirectRequestDto,
  DirectRequestFilterDto,
} from '../dto/create-direct-request.dto';

@Injectable()
export class MentorshipRequestsService {
  private readonly logger = new Logger(MentorshipRequestsService.name);
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  // ========== DIRECT REQUESTS ==========

  async sendDirectRequest(
    userId: string,
    createDirectRequestDto: CreateDirectRequestDto,
  ) {
    try {
      const {
        targetUserId,
        requestType,
        message,
        topic,
        goals,
        jobTitle,
        company,
        yearsOfExperience,
        location,
        careerLevel,
        bio,
      } = createDirectRequestDto;

      this.logger.log(
        `User ${userId} sending ${requestType} to ${targetUserId}`,
      );

      // 1. Check if target user exists
      const { data: targetUser, error: targetError } = await this.admin
        .from('user_profiles')
        .select(
          'id, username, email, avatar, is_willing_to_mentor, mentoring_as',
        )
        .eq('id', targetUserId)
        .single();

      if (targetError || !targetUser) {
        throw new NotFoundException('Target user not found');
      }

      // 2. Validate request
      this.validateDirectRequest(userId, targetUser, requestType);

      // 3. Check for existing requests
      await this.checkExistingRequests(userId, targetUserId);

      // 4. Create direct request
      const requestData = {
        requester_id: userId,
        target_user_id: targetUserId,
        request_type: requestType,
        message: message,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Read tracking fields
        is_read_by_requester: true, // Sender sees it immediately
        is_read_by_target: false, // Receiver hasn't seen it yet
        // Optional fields
        ...(topic && { topic }),
        ...(goals && { goals }),
        ...(jobTitle && { job_title: jobTitle }),
        ...(company && { company }),
        ...(yearsOfExperience && { years_of_experience: yearsOfExperience }),
        ...(location && { location }),
        ...(careerLevel && { career_level: careerLevel }),
        ...(bio && { bio }),
      };

      const { data: request, error: requestError } = await this.admin
        .from('mentorship_direct_requests')
        .insert(requestData)
        .select(
          `
          *,
          requester:requester_id(
            id,
            username,
            email,
            avatar,
            job_title,
            company_encrypted,
            location,
            years_experience
          ),
          target_user:target_user_id(
            id,
            username,
            email,
            avatar,
            job_title,
            company_encrypted,
            location,
            years_experience
          )
        `,
        )
        .single();

      if (requestError) {
        this.logger.error('Request creation error:', requestError);
        if (requestError.code === '23505') {
          throw new BadRequestException(
            'A request already exists for this user',
          );
        }
        throw new BadRequestException(
          `Failed to send direct request: ${requestError.message}`,
        );
      }

      // 5. Create notification for target user
      await this.createDirectRequestNotification(
        userId,
        targetUserId,
        request.id,
        requestType,
      );

      this.logger.log(`Direct request ${request.id} created successfully`);

      return {
        success: true,
        message: 'Direct mentorship request sent successfully',
        data: {
          request,
        },
      };
    } catch (error: any) {
      this.logger.error('sendDirectRequest error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to send direct request: ${error.message || 'Unknown error'}`,
      );
    }
  }

  private validateDirectRequest(
    userId: string,
    targetUser: any,
    requestType: 'mentor_request' | 'mentee_request',
  ) {
    if (userId === targetUser.id) {
      throw new BadRequestException(
        'You cannot send a mentorship request to yourself',
      );
    }

    // User is asking target to be their mentor
    if (requestType === 'mentor_request') {
      const canBeMentor =
        targetUser.is_willing_to_mentor ||
        targetUser.mentoring_as === 'mentor' ||
        targetUser.mentoring_as === 'both';

      if (!canBeMentor) {
        throw new BadRequestException(
          'This user is not currently accepting mentorship requests as a mentor',
        );
      }
    }

    // User is offering to mentor target
    if (requestType === 'mentee_request') {
      const isSeekingMentor =
        targetUser.mentoring_as === 'mentee' ||
        targetUser.mentoring_as === 'both';

      if (!isSeekingMentor) {
        throw new BadRequestException(
          'This user is not currently seeking mentorship',
        );
      }
    }
  }

  private async checkExistingRequests(userId: string, targetUserId: string) {
    const { data: existingRequests, error: existingError } = await this.admin
      .from('mentorship_direct_requests')
      .select('id, status, requester_id')
      .or(
        `and(requester_id.eq.${userId},target_user_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},target_user_id.eq.${userId})`,
      )
      .in('status', ['pending', 'accepted']);

    if (existingError) {
      this.logger.warn('Error checking existing requests:', existingError);
      return;
    }

    if (existingRequests && existingRequests.length > 0) {
      const existingRequest = existingRequests[0];

      // Check if it's a pending request from this user
      const isFromThisUser = existingRequest.requester_id === userId;
      const isPending = existingRequest.status === 'pending';

      if (isFromThisUser && isPending) {
        throw new BadRequestException(
          'You already have a pending request to this user',
        );
      } else if (!isFromThisUser && isPending) {
        throw new BadRequestException(
          'This user already sent you a mentorship request. Please check your received requests.',
        );
      } else if (existingRequest.status === 'accepted') {
        throw new BadRequestException(
          'You already have an active mentorship with this user',
        );
      }
    }
  }

  private async createDirectRequestNotification(
    requesterId: string,
    targetUserId: string,
    requestId: string,
    requestType: string,
  ) {
    try {
      const { data: requester } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', requesterId)
        .single();

      const notificationData = {
        user_id: targetUserId,
        actor_id: requesterId,
        type: 'mentorship_request_received',
        title: 'New Mentorship Request',
        message: `${requester?.username || 'Someone'} sent you a mentorship request`,
        action_url: `/mentorship/requests/direct/${requestId}`,
        reference_id: requestId,
        reference_type: 'mentorship_direct_request',
        metadata: {
          requestType,
          requestId,
          requesterId,
        },
        is_read: false,
        is_delivered: false,
        delivery_method: ['in_app'],
        created_at: new Date().toISOString(),
      };

      await this.admin.from('notifications').insert(notificationData);

      this.logger.log(`Notification created for user ${targetUserId}`);
    } catch (error: any) {
      this.logger.error('Failed to create notification:', error);
      // Don't throw - notification failure shouldn't break the request
    }
  }

  async getDirectRequestsByReceiver(
    userId: string,
    filterDto: DirectRequestFilterDto = {},
  ) {
    try {
      const {
        status,
        requestType,
        page = 1,
        limit = 20,
        markAsRead = false,
      } = filterDto;
      const offset = (page - 1) * limit;

      let query = this.admin
        .from('mentorship_direct_requests')
        .select(
          `
          *,
          requester:requester_id(
            id,
            username,
            email,
            avatar,
            job_title,
            company_encrypted,
            location,
            years_experience,
            mentor_expertise,
            mentor_industries,
            mentor_bio
          )
          `,
          { count: 'exact' },
        )
        .eq('target_user_id', userId);

      if (status) {
        query = query.eq('status', status);
      }

      if (requestType) {
        query = query.eq('request_type', requestType);
      }

      const {
        data: requests,
        error,
        count,
      } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.logger.error('Error fetching direct requests:', error);
        throw new BadRequestException('Failed to retrieve direct requests');
      }

      // Mark as read if requested
      if (markAsRead && requests && requests.length > 0) {
        const requestIds = requests.map((req: any) => req.id);
        await this.markRequestsAsRead(userId, requestIds, 'target');
      }

      return {
        success: true,
        message: 'Direct requests retrieved successfully',
        data: {
          requests: requests || [],
          pagination: {
            total: count || 0,
            page,
            limit,
            pages: Math.ceil((count || 0) / limit),
          },
        },
      };
    } catch (error: any) {
      this.logger.error('getDirectRequestsByReceiver error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve direct requests');
    }
  }

  async getDirectRequestsBySender(
    userId: string,
    filterDto: DirectRequestFilterDto = {},
  ) {
    try {
      const {
        status,
        requestType,
        page = 1,
        limit = 20,
        markAsRead = false,
      } = filterDto;
      const offset = (page - 1) * limit;

      let query = this.admin
        .from('mentorship_direct_requests')
        .select(
          `
          *,
          target_user:target_user_id(
            id,
            username,
            email,
            avatar,
            job_title,
            company_encrypted,
            location,
            years_experience,
            mentor_expertise,
            mentor_industries,
            mentor_bio
          )
          `,
          { count: 'exact' },
        )
        .eq('requester_id', userId);

      if (status) {
        query = query.eq('status', status);
      }

      if (requestType) {
        query = query.eq('request_type', requestType);
      }

      const {
        data: requests,
        error,
        count,
      } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.logger.error('Error fetching sent direct requests:', error);
        throw new BadRequestException(
          'Failed to retrieve sent direct requests',
        );
      }

      // Mark as read if requested
      if (markAsRead && requests && requests.length > 0) {
        const requestIds = requests.map((req: any) => req.id);
        await this.markRequestsAsRead(userId, requestIds, 'requester');
      }

      return {
        success: true,
        message: 'Sent direct requests retrieved successfully',
        data: {
          requests: requests || [],
          pagination: {
            total: count || 0,
            page,
            limit,
            pages: Math.ceil((count || 0) / limit),
          },
        },
      };
    } catch (error: any) {
      this.logger.error('getDirectRequestsBySender error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve sent direct requests');
    }
  }

  // Get all requests (sent + received)
  async getAllDirectRequestsForUser(
    userId: string,
    filterDto: DirectRequestFilterDto = {},
  ) {
    try {
      const {
        status,
        requestType,
        page = 1,
        limit = 20,
        markAsRead = false,
      } = filterDto;
      const offset = (page - 1) * limit;

      // Build query to get both sent and received requests
      let query = this.admin
        .from('mentorship_direct_requests')
        .select(
          `
          *,
          requester:requester_id(
            id,
            username,
            email,
            avatar,
            job_title,
            company_encrypted,
            location,
            years_experience,
            mentor_expertise,
            mentor_industries,
            mentor_bio,
            mentoring_as,
            is_willing_to_mentor
          ),
          target_user:target_user_id(
            id,
            username,
            email,
            avatar,
            job_title,
            company_encrypted,
            location,
            years_experience,
            mentor_expertise,
            mentor_industries,
            mentor_bio,
            mentoring_as,
            is_willing_to_mentor
          )
          `,
          { count: 'exact' },
        )
        .or(`requester_id.eq.${userId},target_user_id.eq.${userId}`);

      // Apply filters
      if (status) {
        query = query.eq('status', status);
      }

      if (requestType) {
        query = query.eq('request_type', requestType);
      }

      const {
        data: requests,
        error,
        count,
      } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.logger.error('Error fetching all direct requests:', error);
        throw new BadRequestException('Failed to retrieve direct requests');
      }

      // Mark all as read if requested
      if (markAsRead && requests && requests.length > 0) {
        const requestIds = requests.map((req: any) => req.id);
        const requesterIds = requests
          .filter((req: any) => req.requester_id === userId)
          .map((req: any) => req.id);
        const targetIds = requests
          .filter((req: any) => req.target_user_id === userId)
          .map((req: any) => req.id);

        await Promise.all([
          this.markRequestsAsRead(userId, requesterIds, 'requester'),
          this.markRequestsAsRead(userId, targetIds, 'target'),
        ]);
      }

      // Process requests to add context
      const processedRequests = (requests || []).map((request: any) => {
        const isSent = request.requester_id === userId;
        const isReceived = request.target_user_id === userId;

        return {
          ...request,
          // Add context information
          requestContext: {
            isSent,
            isReceived,
            // Add role context
            userRole: isSent
              ? request.request_type === 'mentor_request'
                ? 'mentee'
                : 'mentor'
              : request.request_type === 'mentor_request'
                ? 'mentor'
                : 'mentee',
            // Add target user info
            otherUser: isSent ? request.target_user : request.requester,
            // Add read status
            isRead: isSent
              ? request.is_read_by_requester
              : request.is_read_by_target,
          },
        };
      });

      return {
        success: true,
        message: 'All direct requests retrieved successfully',
        data: {
          requests: processedRequests,
          pagination: {
            total: count || 0,
            page,
            limit,
            pages: Math.ceil((count || 0) / limit),
          },
        },
      };
    } catch (error: any) {
      this.logger.error('getAllDirectRequestsForUser error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve direct requests');
    }
  }

  // Check if request sent to specific user
  async checkIfRequestSentToUser(
    currentUserId: string,
    targetUserId: string,
    requestType?: 'mentor_request' | 'mentee_request',
  ) {
    try {
      this.logger.log(
        `Checking if user ${currentUserId} sent request to ${targetUserId}`,
      );

      // Build query
      let query = this.admin
        .from('mentorship_direct_requests')
        .select(
          `
          id,
          request_type,
          status,
          message,
          created_at,
          updated_at,
          target_user:target_user_id(
            id,
            username,
            avatar,
            job_title,
            company_encrypted
          )
          `,
        )
        .eq('requester_id', currentUserId)
        .eq('target_user_id', targetUserId);

      // Filter by request type if provided
      if (requestType) {
        query = query.eq('request_type', requestType);
      }

      // Get all requests
      const { data: existingRequests, error } = await query.order(
        'created_at',
        {
          ascending: false,
        },
      );

      if (error) {
        this.logger.error('Error checking existing requests:', error);
        throw new BadRequestException('Failed to check request status');
      }

      // If no requests found
      if (!existingRequests || existingRequests.length === 0) {
        return {
          success: true,
          hasSentRequest: false,
          message: 'No request found',
          data: null,
        };
      }

      // Get the most recent request
      const latestRequest = existingRequests[0];

      // Check if there's a pending request
      const pendingRequest = existingRequests.find(
        (req) => req.status === 'pending',
      );

      // Check if there's an accepted/active request
      const activeRequest = existingRequests.find(
        (req) => req.status === 'accepted',
      );

      return {
        success: true,
        hasSentRequest: true,
        message: `Found ${existingRequests.length} request(s)`,
        data: {
          latestRequest,
          pendingRequest,
          activeRequest,
          allRequests: existingRequests,
          // Summary
          summary: {
            totalRequests: existingRequests.length,
            pending: existingRequests.filter((req) => req.status === 'pending')
              .length,
            accepted: existingRequests.filter(
              (req) => req.status === 'accepted',
            ).length,
            declined: existingRequests.filter(
              (req) => req.status === 'declined',
            ).length,
            cancelled: existingRequests.filter(
              (req) => req.status === 'cancelled',
            ).length,
          },
          // Quick access properties
          hasPendingRequest: !!pendingRequest,
          hasActiveRequest: !!activeRequest,
          latestStatus: latestRequest.status,
        },
      };
    } catch (error: any) {
      this.logger.error('checkIfRequestSentToUser error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to check request status');
    }
  }

  async getDirectRequest(requestId: string, userId?: string) {
    try {
      const { data: request, error } = await this.admin
        .from('mentorship_direct_requests')
        .select(
          `
        *,
        requester:requester_id(
          id,
          username,
          email,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        ),
        target_user:target_user_id(
          id,
          username,
          email,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        )
      `,
        )
        .eq('id', requestId)
        .single();

      if (error || !request) {
        throw new NotFoundException('Direct request not found');
      }

      // Check authorization if userId is provided
      if (userId) {
        const isAuthorized =
          request.requester_id === userId || request.target_user_id === userId;

        if (!isAuthorized) {
          throw new ForbiddenException(
            'You are not authorized to view this request',
          );
        }

        // Mark as read if user is viewing it
        await this.markDirectRequestAsRead(requestId, userId);
      }

      // FIXED: Return the request object directly, not wrapped in response
      return request;
    } catch (error: any) {
      this.logger.error('getDirectRequest error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve direct request');
    }
  }

  async respondToDirectRequest(
    requestId: string,
    userId: string,
    respondDto: RespondToDirectRequestDto,
  ) {
    try {
      const { action, message } = respondDto;

      this.logger.log(`User ${userId} ${action}ing request ${requestId}`);

      // 1. Get the request - FIXED: Directly fetch from database
      const { data: request, error: requestError } = await this.admin
        .from('mentorship_direct_requests')
        .select(
          `
        *,
        requester:requester_id(
          id,
          username,
          email,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        ),
        target_user:target_user_id(
          id,
          username,
          email,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        )
      `,
        )
        .eq('id', requestId)
        .single();

      if (requestError || !request) {
        throw new NotFoundException('Direct request not found');
      }

      // 2. Validate authorization and action
      const isReceiver = request.target_user_id === userId;
      const isSender = request.requester_id === userId;

      if (!isReceiver && !isSender) {
        throw new ForbiddenException(
          'You are not authorized to respond to this request',
        );
      }

      if (isReceiver && !['accept', 'decline'].includes(action)) {
        throw new BadRequestException(
          'Receivers can only accept or decline requests',
        );
      }

      if (isSender && action !== 'cancel') {
        throw new BadRequestException(
          'Senders can only cancel their own requests',
        );
      }

      // 3. Check current status
      if (request.status !== 'pending') {
        throw new BadRequestException(`Request is already ${request.status}`);
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      let responseStatus: string;
      let notificationType: string;
      let notificationMessage: string;

      switch (action) {
        case 'accept':
          responseStatus = 'accepted';
          updateData.responded_at = new Date().toISOString();
          updateData.response_message = message;
          // Mark as read by both parties when accepted
          updateData.is_read_by_requester = true;
          updateData.is_read_by_target = true;

          // Create mentorship relationship
          await this.createMentorshipRelationship(request);

          notificationType = 'mentorship_request_accepted';
          notificationMessage = `${request.target_user?.username || 'You'} accepted your mentorship request`;
          break;

        case 'decline':
          responseStatus = 'declined';
          updateData.responded_at = new Date().toISOString();
          updateData.response_message = message;
          // Mark as read by both parties when declined
          updateData.is_read_by_requester = true;
          updateData.is_read_by_target = true;
          notificationType = 'mentorship_request_declined';
          notificationMessage = `${request.target_user?.username || 'You'} declined your mentorship request`;
          break;

        case 'cancel':
          responseStatus = 'cancelled';
          // Mark as read by target when cancelled
          updateData.is_read_by_target = true;
          notificationType = 'mentorship_request_cancelled';
          notificationMessage = `${request.requester?.username || 'Someone'} cancelled their mentorship request`;
          break;
      }

      updateData.status = responseStatus;

      // 4. Update the request
      const { data: updatedRequest, error: updateError } = await this.admin
        .from('mentorship_direct_requests')
        .update(updateData)
        .eq('id', requestId)
        .select()
        .single();

      if (updateError) {
        this.logger.error('Update request error:', updateError);
        throw new BadRequestException('Failed to update request');
      }

      // 5. Send notification to the other party
      const notificationUserId = isReceiver
        ? request.requester_id
        : request.target_user_id;
      await this.createResponseNotification(
        notificationUserId,
        userId,
        requestId,
        notificationType,
        notificationMessage,
        responseStatus,
      );

      this.logger.log(`Request ${requestId} ${action}ed successfully`);

      return {
        success: true,
        message: `Request ${action}ed successfully`,
        data: {
          request: updatedRequest,
        },
      };
    } catch (error: any) {
      this.logger.error('respondToDirectRequest error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to respond to request');
    }
  }

  private async createMentorshipRelationship(request: any) {
    try {
      const mentorId =
        request.request_type === 'mentor_request'
          ? request.target_user_id
          : request.requester_id;
      const menteeId =
        request.request_type === 'mentor_request'
          ? request.requester_id
          : request.target_user_id;

      const relationshipData = {
        mentor_id: mentorId,
        mentee_id: menteeId,
        request_topic: request.topic,
        request_goals_encrypted: request.goals,
        request_background_encrypted: request.message,
        status: 'active',
        mentor_skills: [],
        mentee_goals_encrypted: request.goals,
        match_score: 85,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: relationship, error: relError } = await this.admin
        .from('mentorship_relationships')
        .insert(relationshipData)
        .select()
        .single();

      if (relError) {
        this.logger.error('Failed to create relationship:', relError);
        // Don't throw - the request is still accepted
      } else {
        this.logger.log(`Mentorship relationship created: ${relationship.id}`);
      }

      return relationship;
    } catch (error: any) {
      this.logger.error('createMentorshipRelationship error:', error);
      // Don't throw - relationship creation failure shouldn't break the response
    }
  }

  private async createResponseNotification(
    userId: string,
    actorId: string,
    requestId: string,
    type: string,
    message: string,
    status: string,
  ) {
    try {
      const notificationData = {
        user_id: userId,
        actor_id: actorId,
        type,
        title: 'Mentorship Request Update',
        message,
        action_url: `/mentorship/requests/direct/${requestId}`,
        reference_id: requestId,
        reference_type: 'mentorship_direct_request',
        metadata: {
          status,
          requestId,
        },
        is_read: false,
        is_delivered: false,
        delivery_method: ['in_app'],
        created_at: new Date().toISOString(),
      };

      await this.admin.from('notifications').insert(notificationData);
      this.logger.log(`Response notification sent to user ${userId}`);
    } catch (error: any) {
      this.logger.error('Failed to create response notification:', error);
    }
  }

  async deleteDirectRequest(requestId: string, userId: string) {
    try {
      this.logger.log(`User ${userId} deleting request ${requestId}`);

      // Get request to check ownership
      const { data: request, error: requestError } = await this.admin
        .from('mentorship_direct_requests')
        .select('requester_id, status')
        .eq('id', requestId)
        .single();

      if (requestError || !request) {
        throw new NotFoundException('Request not found');
      }

      // Only requester can delete, and only if pending
      if (request.requester_id !== userId) {
        throw new ForbiddenException('You can only delete your own requests');
      }

      if (request.status !== 'pending') {
        throw new BadRequestException(
          `Cannot delete a ${request.status} request`,
        );
      }

      const { error: deleteError } = await this.admin
        .from('mentorship_direct_requests')
        .delete()
        .eq('id', requestId);

      if (deleteError) {
        this.logger.error('Delete request error:', deleteError);
        throw new BadRequestException('Failed to delete request');
      }

      this.logger.log(`Request ${requestId} deleted successfully`);

      return {
        success: true,
        message: 'Request deleted successfully',
      };
    } catch (error: any) {
      this.logger.error('deleteDirectRequest error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to delete request');
    }
  }

  // ========== READ TRACKING & METRICS ==========

  async markDirectRequestAsRead(requestId: string, userId: string) {
    try {
      this.logger.log(`Marking request ${requestId} as read by user ${userId}`);

      // Get the request
      const { data: request } = await this.getDirectRequest(requestId, userId);

      // Determine which read field to update
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (request.requester_id === userId && !request.is_read_by_requester) {
        updateData.is_read_by_requester = true;
      } else if (
        request.target_user_id === userId &&
        !request.is_read_by_target
      ) {
        updateData.is_read_by_target = true;
      } else {
        // Already read or not authorized
        return {
          success: true,
          message: 'Request already marked as read',
          data: { request },
        };
      }

      // Update the request
      const { data: updatedRequest, error } = await this.admin
        .from('mentorship_direct_requests')
        .update(updateData)
        .eq('id', requestId)
        .select()
        .single();

      if (error) {
        this.logger.error('Error marking request as read:', error);
        throw new BadRequestException('Failed to mark request as read');
      }

      this.logger.log(`Request ${requestId} marked as read by user ${userId}`);
      return {
        success: true,
        message: 'Request marked as read',
        data: {
          request: updatedRequest,
        },
      };
    } catch (error: any) {
      this.logger.error('markDirectRequestAsRead error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to mark request as read');
    }
  }

  // Helper method to mark multiple requests as read
  private async markRequestsAsRead(
    userId: string,
    requestIds: string[],
    userRole: 'requester' | 'target',
  ) {
    if (!requestIds || requestIds.length === 0) return;

    const updateField =
      userRole === 'requester' ? 'is_read_by_requester' : 'is_read_by_target';

    const { error } = await this.admin
      .from('mentorship_direct_requests')
      .update({
        [updateField]: true,
        updated_at: new Date().toISOString(),
      })
      .in('id', requestIds)
      .eq(updateField, false); // Only update if not already read

    if (error) {
      this.logger.warn(`Failed to mark requests as read:`, error);
    } else {
      this.logger.log(
        `Marked ${requestIds.length} requests as read for ${userRole} ${userId}`,
      );
    }
  }

  async markAllDirectRequestsAsRead(
    userId: string,
    requestType?: 'sent' | 'received',
  ) {
    try {
      this.logger.log(`Marking all requests as read for user ${userId}`);

      // Find all unread requests for the user
      let query = this.admin
        .from('mentorship_direct_requests')
        .select(
          'id, requester_id, target_user_id, is_read_by_requester, is_read_by_target',
        )
        .or(`requester_id.eq.${userId},target_user_id.eq.${userId}`);

      const { data: requests, error } = await query;

      if (error) {
        this.logger.error('Error fetching requests:', error);
        throw new BadRequestException('Failed to fetch requests');
      }

      // Filter based on requestType and unread status
      let requestsToMark = (requests || []).filter((request) => {
        if (request.requester_id === userId && !request.is_read_by_requester) {
          return requestType ? requestType === 'sent' : true;
        }
        if (request.target_user_id === userId && !request.is_read_by_target) {
          return requestType ? requestType === 'received' : true;
        }
        return false;
      });

      // Mark each request as read
      const updatePromises = requestsToMark.map(async (request) => {
        const updateData: any = {
          updated_at: new Date().toISOString(),
        };

        if (request.requester_id === userId) {
          updateData.is_read_by_requester = true;
        } else if (request.target_user_id === userId) {
          updateData.is_read_by_target = true;
        }

        return this.admin
          .from('mentorship_direct_requests')
          .update(updateData)
          .eq('id', request.id);
      });

      await Promise.all(updatePromises);

      this.logger.log(
        `Marked ${requestsToMark.length} requests as read for user ${userId}`,
      );

      return {
        success: true,
        message: `Marked ${requestsToMark.length} requests as read`,
        data: {
          count: requestsToMark.length,
          requestType,
        },
      };
    } catch (error: any) {
      this.logger.error('markAllDirectRequestsAsRead error:', error);
      throw new BadRequestException('Failed to mark all requests as read');
    }
  }

  // Get metrics/unread counts
  async getDirectRequestMetrics(userId: string) {
    try {
      this.logger.log(`Getting request metrics for user ${userId}`);

      // Get all requests for the user
      const { data: requests, error } = await this.admin
        .from('mentorship_direct_requests')
        .select('*')
        .or(`requester_id.eq.${userId},target_user_id.eq.${userId}`);

      if (error) {
        this.logger.error('Error fetching requests for metrics:', error);
        throw new BadRequestException('Failed to fetch request metrics');
      }

      const allRequests = requests || [];

      // Calculate metrics
      const metrics = {
        total: allRequests.length,
        sent: {
          total: allRequests.filter((req) => req.requester_id === userId)
            .length,
          unread: allRequests.filter(
            (req) => req.requester_id === userId && !req.is_read_by_requester,
          ).length,
          byStatus: {
            pending: allRequests.filter(
              (req) => req.requester_id === userId && req.status === 'pending',
            ).length,
            accepted: allRequests.filter(
              (req) => req.requester_id === userId && req.status === 'accepted',
            ).length,
            declined: allRequests.filter(
              (req) => req.requester_id === userId && req.status === 'declined',
            ).length,
            cancelled: allRequests.filter(
              (req) =>
                req.requester_id === userId && req.status === 'cancelled',
            ).length,
          },
          byType: {
            mentor_requests: allRequests.filter(
              (req) =>
                req.requester_id === userId &&
                req.request_type === 'mentor_request',
            ).length,
            mentee_requests: allRequests.filter(
              (req) =>
                req.requester_id === userId &&
                req.request_type === 'mentee_request',
            ).length,
          },
        },
        received: {
          total: allRequests.filter((req) => req.target_user_id === userId)
            .length,
          unread: allRequests.filter(
            (req) => req.target_user_id === userId && !req.is_read_by_target,
          ).length,
          byStatus: {
            pending: allRequests.filter(
              (req) =>
                req.target_user_id === userId && req.status === 'pending',
            ).length,
            accepted: allRequests.filter(
              (req) =>
                req.target_user_id === userId && req.status === 'accepted',
            ).length,
            declined: allRequests.filter(
              (req) =>
                req.target_user_id === userId && req.status === 'declined',
            ).length,
            cancelled: allRequests.filter(
              (req) =>
                req.target_user_id === userId && req.status === 'cancelled',
            ).length,
          },
          byType: {
            mentor_requests: allRequests.filter(
              (req) =>
                req.target_user_id === userId &&
                req.request_type === 'mentor_request',
            ).length,
            mentee_requests: allRequests.filter(
              (req) =>
                req.target_user_id === userId &&
                req.request_type === 'mentee_request',
            ).length,
          },
        },
        // Quick access for badges
        totalUnread: allRequests.filter((req) => {
          if (req.requester_id === userId) return !req.is_read_by_requester;
          if (req.target_user_id === userId) return !req.is_read_by_target;
          return false;
        }).length,
        pendingReceivedUnread: allRequests.filter(
          (req) =>
            req.target_user_id === userId &&
            req.status === 'pending' &&
            !req.is_read_by_target,
        ).length,
        pendingSentUnread: allRequests.filter(
          (req) =>
            req.requester_id === userId &&
            req.status === 'pending' &&
            !req.is_read_by_requester,
        ).length,
        // Recent activity
        recentActivity: {
          last7Days: allRequests.filter((req) => {
            const createdAt = new Date(req.created_at);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            return createdAt >= sevenDaysAgo;
          }).length,
          last30Days: allRequests.filter((req) => {
            const createdAt = new Date(req.created_at);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return createdAt >= thirtyDaysAgo;
          }).length,
        },
      };

      return {
        success: true,
        message: 'Request metrics retrieved successfully',
        data: metrics,
      };
    } catch (error: any) {
      this.logger.error('getDirectRequestMetrics error:', error);
      throw new BadRequestException('Failed to retrieve request metrics');
    }
  }

  // ========== STATISTICS & HELPER METHODS ==========

  async getDirectRequestStats(userId: string) {
    try {
      // Get sent requests count by status
      const { data: sentRequests, error: sentError } = await this.admin
        .from('mentorship_direct_requests')
        .select('status')
        .eq('requester_id', userId);

      // Get received requests count by status
      const { data: receivedRequests, error: receivedError } = await this.admin
        .from('mentorship_direct_requests')
        .select('status')
        .eq('target_user_id', userId);

      // Get active relationships count
      const { data: relationships, error: relationshipsError } =
        await this.admin
          .from('mentorship_relationships')
          .select('id')
          .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`)
          .eq('status', 'active');

      if (sentError || receivedError || relationshipsError) {
        this.logger.warn('Error getting request stats:', {
          sentError,
          receivedError,
          relationshipsError,
        });
      }

      // Count by status
      const sentStats = {
        pending:
          sentRequests?.filter((r) => r.status === 'pending').length || 0,
        accepted:
          sentRequests?.filter((r) => r.status === 'accepted').length || 0,
        declined:
          sentRequests?.filter((r) => r.status === 'declined').length || 0,
        cancelled:
          sentRequests?.filter((r) => r.status === 'cancelled').length || 0,
      };

      const receivedStats = {
        pending:
          receivedRequests?.filter((r) => r.status === 'pending').length || 0,
        accepted:
          receivedRequests?.filter((r) => r.status === 'accepted').length || 0,
        declined:
          receivedRequests?.filter((r) => r.status === 'declined').length || 0,
        cancelled:
          receivedRequests?.filter((r) => r.status === 'cancelled').length || 0,
      };

      return {
        success: true,
        message: 'Request statistics retrieved successfully',
        data: {
          sent: sentStats,
          received: receivedStats,
          activeMentorships: relationships?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error('getDirectRequestStats error:', error);
      throw new BadRequestException('Failed to retrieve request statistics');
    }
  }
  // CORRECTED VERSION based on your actual schema

  async getMyMentors(userId: string) {
    try {
      this.logger.log(`Getting mentors for user ${userId}`);

      // Get mentorship direct requests where user is the mentee
      // Case 1: User requested someone as mentor (mentor_request) AND user is requester
      const { data: sentMentorRequests, error: sentError } = await this.admin
        .from('mentorship_direct_requests')
        .select(
          `
        *,
        target_user:target_user_id (
          id,
          username,
          email,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        )
      `,
        )
        .eq('requester_id', userId)
        .eq('request_type', 'mentor_request')
        .eq('status', 'accepted');

      // Case 2: Someone offered to mentor user (mentee_request) AND user is target
      const { data: receivedMenteeRequests, error: receivedError } =
        await this.admin
          .from('mentorship_direct_requests')
          .select(
            `
        *,
        requester:requester_id (
          id,
          username,
          email,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        )
      `,
          )
          .eq('target_user_id', userId)
          .eq('request_type', 'mentee_request')
          .eq('status', 'accepted');

      if (sentError || receivedError) {
        this.logger.error('Error fetching mentor requests:', {
          sentError,
          receivedError,
        });
        throw new BadRequestException(
          'Failed to fetch mentors from direct requests',
        );
      }

      // Get mentorship relationships where user is the mentee
      const { data: mentorRelationships, error: relationshipsError } =
        await this.admin
          .from('mentorship_relationships')
          .select(
            `
        *,
        mentor:mentor_id (
          id,
          username,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        )
      `,
          )
          .eq('mentee_id', userId)
          .eq('status', 'active');

      if (relationshipsError) {
        this.logger.error(
          'Error fetching mentor relationships:',
          relationshipsError,
        );
        // Don't throw, we can still return direct requests
      }

      // Process sent mentor requests (user requested someone as mentor)
      const mentorsFromSentRequests: any[] = [];
      (sentMentorRequests || []).forEach((request: any) => {
        if (request.target_user) {
          mentorsFromSentRequests.push({
            id: request.id,
            source: 'direct_request',
            connectionType: 'requested_mentor',
            type: 'mentor',
            mentor: request.target_user,
            message: request.message,
            connectedSince: request.responded_at || request.created_at,
            status: request.status,
            topic: request.topic,
            goals: request.goals,
          });
        }
      });

      // Process received mentee requests (someone offered to mentor user)
      const mentorsFromReceivedRequests: any[] = [];
      (receivedMenteeRequests || []).forEach((request: any) => {
        if (request.requester) {
          mentorsFromReceivedRequests.push({
            id: request.id,
            source: 'direct_request',
            connectionType: 'offered_mentorship',
            type: 'mentor',
            mentor: request.requester,
            message: request.message,
            connectedSince: request.responded_at || request.created_at,
            status: request.status,
            topic: request.topic,
            goals: request.goals,
          });
        }
      });

      // Process mentorship relationships
      const mentorsFromRelationships: any[] = [];
      (mentorRelationships || []).forEach((relationship: any) => {
        if (relationship.mentor) {
          mentorsFromRelationships.push({
            id: relationship.id,
            source: 'relationship',
            type: 'mentor',
            mentor: relationship.mentor,
            matchScore: relationship.match_score,
            connectedSince: relationship.started_at || relationship.created_at,
            status: relationship.status,
            topic: relationship.request_topic,
            goals: relationship.mentee_goals_encrypted,
            completedSessions: relationship.completed_sessions,
            totalSessions: relationship.total_sessions,
          });
        }
      });

      // Combine all mentors
      const allMentors = [
        ...mentorsFromSentRequests,
        ...mentorsFromReceivedRequests,
        ...mentorsFromRelationships,
      ];

      // Remove duplicates based on mentor ID
      const uniqueMentors = Array.from(
        new Map(allMentors.map((item) => [item.mentor.id, item])).values(),
      );

      // Sort by most recent connection
      uniqueMentors.sort(
        (a, b) =>
          new Date(b.connectedSince).getTime() -
          new Date(a.connectedSince).getTime(),
      );

      return {
        success: true,
        message: 'Mentors retrieved successfully',
        data: {
          mentors: uniqueMentors,
          stats: {
            total: uniqueMentors.length,
            fromSentRequests: mentorsFromSentRequests.length,
            fromReceivedRequests: mentorsFromReceivedRequests.length,
            fromRelationships: mentorsFromRelationships.length,
          },
        },
      };
    } catch (error: any) {
      this.logger.error('getMyMentors error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to retrieve mentors: ' + error.message,
      );
    }
  }

  async getMyMentees(userId: string) {
    try {
      this.logger.log(`Getting mentees for user ${userId}`);

      // Get mentorship direct requests where user is the mentor
      // Case 1: User offered to mentor someone (mentee_request) AND user is requester
      const { data: sentMenteeRequests, error: sentError } = await this.admin
        .from('mentorship_direct_requests')
        .select(
          `
        *,
        target_user:target_user_id (
          id,
          username,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        )
      `,
        )
        .eq('requester_id', userId)
        .eq('request_type', 'mentee_request')
        .eq('status', 'accepted');

      // Case 2: Someone requested user as mentor (mentor_request) AND user is target
      const { data: receivedMentorRequests, error: receivedError } =
        await this.admin
          .from('mentorship_direct_requests')
          .select(
            `
        *,
        requester:requester_id (
          id,
          username,
          email,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        )
      `,
          )
          .eq('target_user_id', userId)
          .eq('request_type', 'mentor_request')
          .eq('status', 'accepted');

      if (sentError || receivedError) {
        this.logger.error('Error fetching mentee requests:', {
          sentError,
          receivedError,
        });
        throw new BadRequestException(
          'Failed to fetch mentees from direct requests',
        );
      }

      // Get mentorship relationships where user is the mentor
      const { data: menteeRelationships, error: relationshipsError } =
        await this.admin
          .from('mentorship_relationships')
          .select(
            `
        *,
        mentee:mentee_id (
          id,
          username,
          email,
          avatar,
          job_title,
          company_encrypted,
          location,
          years_experience,
          mentor_expertise,
          mentor_industries,
          mentor_bio
        )
      `,
          )
          .eq('mentor_id', userId)
          .eq('status', 'active');

      if (relationshipsError) {
        this.logger.error(
          'Error fetching mentee relationships:',
          relationshipsError,
        );
        // Don't throw, we can still return direct requests
      }

      // Process sent mentee requests (user offered to mentor someone)
      const menteesFromSentRequests: any[] = [];
      (sentMenteeRequests || []).forEach((request: any) => {
        if (request.target_user) {
          menteesFromSentRequests.push({
            id: request.id,
            source: 'direct_request',
            connectionType: 'offered_mentorship',
            type: 'mentee',
            mentee: request.target_user,
            message: request.message,
            connectedSince: request.responded_at || request.created_at,
            status: request.status,
            topic: request.topic,
            goals: request.goals,
          });
        }
      });

      // Process received mentor requests (someone requested user as mentor)
      const menteesFromReceivedRequests: any[] = [];
      (receivedMentorRequests || []).forEach((request: any) => {
        if (request.requester) {
          menteesFromReceivedRequests.push({
            id: request.id,
            source: 'direct_request',
            connectionType: 'requested_mentor',
            type: 'mentee',
            mentee: request.requester,
            message: request.message,
            connectedSince: request.responded_at || request.created_at,
            status: request.status,
            topic: request.topic,
            goals: request.goals,
          });
        }
      });

      // Process mentorship relationships
      const menteesFromRelationships: any[] = [];
      (menteeRelationships || []).forEach((relationship: any) => {
        if (relationship.mentee) {
          menteesFromRelationships.push({
            id: relationship.id,
            source: 'relationship',
            type: 'mentee',
            mentee: relationship.mentee,
            matchScore: relationship.match_score,
            connectedSince: relationship.started_at || relationship.created_at,
            status: relationship.status,
            topic: relationship.request_topic,
            goals: relationship.mentee_goals_encrypted,
            completedSessions: relationship.completed_sessions,
            totalSessions: relationship.total_sessions,
          });
        }
      });

      // Combine all mentees
      const allMentees = [
        ...menteesFromSentRequests,
        ...menteesFromReceivedRequests,
        ...menteesFromRelationships,
      ];

      // Remove duplicates based on mentee ID
      const uniqueMentees = Array.from(
        new Map(allMentees.map((item) => [item.mentee.id, item])).values(),
      );

      // Sort by most recent connection
      uniqueMentees.sort(
        (a, b) =>
          new Date(b.connectedSince).getTime() -
          new Date(a.connectedSince).getTime(),
      );

      return {
        success: true,
        message: 'Mentees retrieved successfully',
        data: {
          mentees: uniqueMentees,
          stats: {
            total: uniqueMentees.length,
            fromSentRequests: menteesFromSentRequests.length,
            fromReceivedRequests: menteesFromReceivedRequests.length,
            fromRelationships: menteesFromRelationships.length,
          },
        },
      };
    } catch (error: any) {
      this.logger.error('getMyMentees error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to retrieve mentees: ' + error.message,
      );
    }
  }
}
