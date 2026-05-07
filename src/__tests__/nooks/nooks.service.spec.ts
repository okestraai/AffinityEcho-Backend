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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NooksService } from '../../modules/nooks/services/nooks.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('NooksService', () => {
  let service: NooksService;
  let mockClient: any;
  let mockRedis: any;

  const mockNook = {
    id: 'nook-1',
    title: 'Test Nook',
    description: 'desc',
    urgency: 'medium',
    scope: 'global',
    hashtags: ['tech'],
    creator_id: 'u1',
    members_count: 1,
    messages_count: 0,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    created_at: '2026-05-01',
    is_active: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn(),
      delPattern: jest.fn(),
    };

    const mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue([]),
    };
    const mockEncryption = {
      encrypt: jest.fn((v) => v + '_enc'),
      decrypt: jest.fn((v) => v + '_dec'),
    };
    const mockOkestra = {
      generateNookSuggestions: jest.fn().mockResolvedValue([]),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    service = new NooksService(
      createMockConfigService() as any,
      mockRedis,
      mockIdentityReveal,
      mockEncryption,
      mockOkestra,
    );
  });

  describe('create', () => {
    it('should create a nook and auto-join creator', async () => {
      const insertChain = createMockQueryChain({ data: mockNook, error: null });
      const memberChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(memberChain);

      const result = await service.create(
        { title: 'Test Nook', description: 'desc' } as any,
        'u1',
      );
      expect(result.success).toBe(true);
      expect(result.data.nook.title).toBe('Test Nook');
      expect(result.message).toBe(MSG.NOOK.CREATED);
    });

    it('should throw on insert error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'insert failed' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.create({ title: 'Test' } as any, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return cached nooks if available', async () => {
      const cached = { success: true, data: { nooks: [mockNook] } };
      mockRedis.get.mockResolvedValueOnce(cached);

      const result = await service.findAll({} as any, 'u2');
      expect(result).toEqual(cached);
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('should query and cache nooks', async () => {
      const chain = createMockQueryChain({
        data: [mockNook],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAll({} as any, 'u2');
      expect(result.success).toBe(true);
      expect(result.data.nooks).toHaveLength(1);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should throw on query error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'query failed' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.findAll({} as any, 'u2')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findOne', () => {
    it('should return nook by ID', async () => {
      const nookChain = createMockQueryChain({ data: mockNook, error: null });
      const viewChain = createMockQueryChain({ data: null, error: null });
      const memberChain = createMockQueryChain({
        data: [{ user_id: 'u1' }],
        error: null,
        count: 1,
      });
      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(viewChain)
        .mockReturnValueOnce(memberChain);

      const result = await service.findOne('nook-1', 'u1');
      expect(result.success).toBe(true);
    });

    it('should throw if nook not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.findOne('nope', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if nook expired', async () => {
      const expiredNook = {
        ...mockNook,
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      };
      const chain = createMockQueryChain({ data: expiredNook, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.findOne('nook-1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should delete nook', async () => {
      const fetchChain = createMockQueryChain({
        data: { creator_id: 'u1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.remove('nook-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.NOOK.DELETED);
    });

    it('should throw if nook not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('lock', () => {
    it('should lock nook', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(updateChain);

      const result = await service.lock('nook-1', 'test reason');
      expect(result.success).toBe(true);
    });
  });

  describe('getGlobalStats', () => {
    it('should return nook stats', async () => {
      const chain = createMockQueryChain({
        data: [{ user_id: 'u1' }],
        error: null,
        count: 5,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getGlobalStats();
      expect(result.success).toBe(true);
      expect(result.data.activeNooks).toBeDefined();
    });
  });
});
