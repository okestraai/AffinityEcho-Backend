jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { NookMembersService } from '../../modules/nooks/services/nook-members.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

const makeNook = (overrides: Record<string, any> = {}) => ({
  id: 'n1',
  is_active: true,
  is_locked: false,
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  members_count: 5,
  creator_id: 'owner',
  ...overrides,
});

describe('NookMembersService', () => {
  let service: NookMembersService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new NookMembersService(createMockConfigService() as any);
  });

  describe('join', () => {
    it('should join a nook successfully', async () => {
      const nookChain = createMockQueryChain({ data: makeNook(), error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({
        data: { id: 'mem1', nook_id: 'n1', user_id: 'u1', joined_at: '2026-01-01' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.join('n1', 'u1', {} as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.NOOK.JOINED);
      expect(result.data.membership.id).toBe('mem1');
    });

    it('should throw NotFoundException if nook not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.join('n1', 'u1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if nook is inactive', async () => {
      const chain = createMockQueryChain({ data: makeNook({ is_active: false }), error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.join('n1', 'u1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if nook is locked', async () => {
      const chain = createMockQueryChain({ data: makeNook({ is_locked: true }), error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.join('n1', 'u1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if nook is expired', async () => {
      const chain = createMockQueryChain({
        data: makeNook({ expires_at: new Date(Date.now() - 1000).toISOString() }),
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.join('n1', 'u1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already a member', async () => {
      const nookChain = createMockQueryChain({ data: makeNook(), error: null });
      const existingChain = createMockQueryChain({ data: { id: 'mem1' }, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain);

      await expect(service.join('n1', 'u1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on insert error', async () => {
      const nookChain = createMockQueryChain({ data: makeNook(), error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain);

      await expect(service.join('n1', 'u1', {} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('leave', () => {
    it('should leave a nook successfully', async () => {
      const nookChain = createMockQueryChain({
        data: { creator_id: 'owner', members_count: 5 },
        error: null,
      });
      const memberChain = createMockQueryChain({ data: { id: 'mem1' }, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(memberChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.leave('n1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.NOOK.LEFT);
    });

    it('should throw NotFoundException if nook not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.leave('n1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user is creator', async () => {
      const chain = createMockQueryChain({
        data: { creator_id: 'u1', members_count: 1 },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.leave('n1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if not a member', async () => {
      const nookChain = createMockQueryChain({
        data: { creator_id: 'owner', members_count: 5 },
        error: null,
      });
      const memberChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(memberChain);

      await expect(service.leave('n1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMembers', () => {
    it('should return nook members', async () => {
      const nookChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      const membersChain = createMockQueryChain({
        data: [
          { id: 'mem1', user_id: 'u1', joined_at: '2026-01-01', messages_sent: 10, last_read_at: null },
          { id: 'mem2', user_id: 'u2', joined_at: '2026-01-02', messages_sent: 5, last_read_at: null },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(membersChain);

      const result = await service.getMembers('n1');
      expect(result.success).toBe(true);
      expect(result.data.members).toHaveLength(2);
      expect(result.data.total).toBe(2);
    });

    it('should throw NotFoundException if nook not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getMembers('n1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on members query error', async () => {
      const nookChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      const membersChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(membersChain);

      await expect(service.getMembers('n1')).rejects.toThrow(BadRequestException);
    });

    it('should return empty list when no members', async () => {
      const nookChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      const membersChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(membersChain);

      const result = await service.getMembers('n1');
      expect(result.data.members).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });
  });
});
