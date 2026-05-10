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
import { NookReactionsService } from '../../modules/nooks/services/nook-reactions.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('NookReactionsService', () => {
  let service: NookReactionsService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new NookReactionsService(createMockConfigService() as any);
  });

  describe('reactToNook', () => {
    it('should add a nook reaction successfully', async () => {
      const nookChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({
        data: { id: 'nr1', nook_id: 'n1', user_id: 'u1', reaction_type: 'heard' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.reactToNook('n1', 'u1', { reaction_type: 'heard' } as any);
      expect(result.success).toBe(true);
      expect(result.data.reaction.reaction_type).toBe('heard');
    });

    it('should throw BadRequestException for invalid reaction type', async () => {
      await expect(
        service.reactToNook('n1', 'u1', { reaction_type: 'invalid' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if nook not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.reactToNook('n1', 'u1', { reaction_type: 'heard' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if reaction already exists', async () => {
      const nookChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      const existingChain = createMockQueryChain({ data: { id: 'nr1' }, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain);

      await expect(
        service.reactToNook('n1', 'u1', { reaction_type: 'validated' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on insert error', async () => {
      const nookChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain);

      await expect(
        service.reactToNook('n1', 'u1', { reaction_type: 'inspired' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeNookReaction', () => {
    it('should remove a nook reaction successfully', async () => {
      const fetchChain = createMockQueryChain({ data: { id: 'nr1' }, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.removeNookReaction('n1', 'u1', 'heard');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.NOOK.REACTION_REMOVED);
    });

    it('should throw NotFoundException if reaction not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.removeNookReaction('n1', 'u1', 'heard')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on delete error', async () => {
      const fetchChain = createMockQueryChain({ data: { id: 'nr1' }, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain);

      await expect(service.removeNookReaction('n1', 'u1', 'heard')).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleMessageReaction', () => {
    it('should add a message reaction', async () => {
      const msgChain = createMockQueryChain({ data: { id: 'm1', nook_id: 'n1' }, error: null });
      const nookChain = createMockQueryChain({ data: { id: 'n1', creator_id: 'owner' }, error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const fullMsgChain = createMockQueryChain({
        data: { id: 'm1', heard_count: 2, nook_id: 'n1' },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: { id: 'mr1', message_id: 'm1', user_id: 'u1', reaction_type: 'heard' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(fullMsgChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.toggleMessageReaction('m1', 'u1', { reaction_type: 'heard' } as any);
      expect(result.success).toBe(true);
      expect(result.data.action).toBe('added');
    });

    it('should remove a message reaction when it already exists', async () => {
      const msgChain = createMockQueryChain({ data: { id: 'm1', nook_id: 'n1' }, error: null });
      const nookChain = createMockQueryChain({ data: { id: 'n1', creator_id: 'owner' }, error: null });
      const existingChain = createMockQueryChain({ data: { id: 'mr1' }, error: null });
      const fullMsgChain = createMockQueryChain({
        data: { id: 'm1', validated_count: 3 },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(fullMsgChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.toggleMessageReaction('m1', 'u1', { reaction_type: 'validated' } as any);
      expect(result.success).toBe(true);
      expect(result.data.action).toBe('removed');
    });

    it('should throw BadRequestException for invalid reaction type', async () => {
      await expect(
        service.toggleMessageReaction('m1', 'u1', { reaction_type: 'invalid' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if message not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.toggleMessageReaction('m1', 'u1', { reaction_type: 'helpful' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if nook not found', async () => {
      const msgChain = createMockQueryChain({ data: { id: 'm1', nook_id: 'n1' }, error: null });
      const nookChain = createMockQueryChain({ data: null, error: { message: 'not found' } });

      mockClient.from
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(nookChain);

      await expect(
        service.toggleMessageReaction('m1', 'u1', { reaction_type: 'supportive' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
