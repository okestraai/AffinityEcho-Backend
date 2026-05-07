import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MentorshipRelationshipsService } from '../../modules/mentorship/services/mentorship-relationships.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../../__tests__/helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('MentorshipRelationshipsService', () => {
  let service: MentorshipRelationshipsService;
  let mockClient: any;
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockConfig = createMockConfigService();

    service = new MentorshipRelationshipsService(mockConfig);
  });

  describe('acceptRelationship (updateRelationshipStatus with accept)', () => {
    it('should accept a pending relationship successfully', async () => {
      const relationshipId = 'rel-001';
      const userId = 'mentee-123';

      // 1. Fetch relationship to check ownership: from('mentorship_relationships').select(...)...single()
      const fetchChain = createMockQueryChain({
        data: {
          mentor_id: 'mentor-456',
          mentee_id: userId,
          status: 'pending',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      // 2. Update relationship: from('mentorship_relationships').update(...).eq(...).select(...).single()
      const updatedRelationship = {
        id: relationshipId,
        mentor_id: 'mentor-456',
        mentee_id: userId,
        status: 'accepted',
        started_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      };
      const updateChain = createMockQueryChain({
        data: updatedRelationship,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      // 3. createNotification: from('notifications').insert(...)
      const notifChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(notifChain);

      const result = await service.updateRelationshipStatus(
        relationshipId,
        userId,
        { action: 'accept' },
      );

      expect(result.message).toBe(
        'Mentorship accepted! You can now start chatting',
      );
      expect(result.relationship).toBeDefined();
      expect(result.relationship.status).toBe('accepted');

      // Verify notification was created for the mentor
      expect(mockClient.from).toHaveBeenCalledWith('notifications');
    });
  });

  describe('getRelationships', () => {
    it('should return relationships for a user as both mentor and mentee', async () => {
      const userId = 'user-123';

      const mentorRelationships = [
        {
          id: 'rel-001',
          mentor_id: userId,
          mentee_id: 'mentee-456',
          status: 'active',
          mentor: { id: userId, username: 'mentoruser', avatar: 'a.png' },
          mentee: { id: 'mentee-456', username: 'menteeuser', avatar: 'b.png' },
        },
      ];

      const menteeRelationships = [
        {
          id: 'rel-002',
          mentor_id: 'mentor-789',
          mentee_id: userId,
          status: 'pending',
          mentor: {
            id: 'mentor-789',
            username: 'othermentor',
            avatar: 'c.png',
          },
          mentee: { id: userId, username: 'mentoruser', avatar: 'a.png' },
        },
      ];

      // getRelationships issues two parallel queries (mentorQuery + menteeQuery)
      // Both call from('mentorship_relationships')
      const mentorChain = createMockQueryChain({
        data: mentorRelationships,
        error: null,
      });
      const menteeChain = createMockQueryChain({
        data: menteeRelationships,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(mentorChain);
      mockClient.from.mockReturnValueOnce(menteeChain);

      const result = await service.getRelationships(userId);

      expect(result.asMentor).toHaveLength(1);
      expect(result.asMentee).toHaveLength(1);
      expect(result.asMentor[0].id).toBe('rel-001');
      expect(result.asMentee[0].id).toBe('rel-002');
    });
  });

  describe('updateRelationshipStatus - decline', () => {
    it('should decline a pending relationship', async () => {
      const relationshipId = 'rel-001';
      const userId = 'mentee-123';
      const reason = 'Not a good fit';

      // 1. Fetch relationship
      const fetchChain = createMockQueryChain({
        data: {
          mentor_id: 'mentor-456',
          mentee_id: userId,
          status: 'pending',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      // 2. Update relationship to declined
      const updatedRelationship = {
        id: relationshipId,
        mentor_id: 'mentor-456',
        mentee_id: userId,
        status: 'declined',
        declined_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      };
      const updateChain = createMockQueryChain({
        data: updatedRelationship,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      // 3. createNotification
      const notifChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(notifChain);

      const result = await service.updateRelationshipStatus(
        relationshipId,
        userId,
        { action: 'decline', reason },
      );

      expect(result.message).toBe('Relationship declined successfully');
      expect(result.relationship).toBeDefined();
      expect(result.relationship.status).toBe('declined');
    });
  });

  describe('getRelationship', () => {
    it('should return a single relationship by ID', async () => {
      const relationshipId = 'rel-001';

      const mockRelationship = {
        id: relationshipId,
        mentor_id: 'mentor-456',
        mentee_id: 'mentee-789',
        status: 'active',
        meeting_frequency: 'weekly',
        total_sessions: 5,
        completed_sessions: 3,
        mentor: {
          id: 'mentor-456',
          username: 'mentoruser',
          avatar: 'avatar.png',
          job_title: 'Senior Engineer',
          company_type: 'Tech',
          mentor_bio: 'Experienced mentor',
          mentor_expertise: ['leadership'],
        },
        mentee: {
          id: 'mentee-789',
          username: 'menteeuser',
          avatar: 'avatar2.png',
          job_title: 'Junior Engineer',
          company_type: 'Startup',
          mentee_goals: ['career growth'],
          mentee_interests: ['backend'],
        },
        sessions: [
          {
            id: 'session-001',
            scheduled_at: '2026-01-20T10:00:00Z',
            duration_minutes: 60,
            status: 'completed',
          },
        ],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      };

      const chain = createMockQueryChain({
        data: mockRelationship,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getRelationship(relationshipId);

      expect(result.id).toBe(relationshipId);
      expect(result.status).toBe('active');
      expect(result.mentor.id).toBe('mentor-456');
      expect(result.mentee.id).toBe('mentee-789');
      expect(result.sessions).toHaveLength(1);
    });

    it('should throw NotFoundException when relationship is not found', async () => {
      const relationshipId = 'non-existent';

      const chain = createMockQueryChain({
        data: null,
        error: { message: 'Not found' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getRelationship(relationshipId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
