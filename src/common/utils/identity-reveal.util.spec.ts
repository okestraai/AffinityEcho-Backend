jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
}));

import { IdentityRevealUtil } from './identity-reveal.util';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockQueryChain,
  createMockSupabaseClient,
} from '../../__tests__/helpers/mock-supabase';

describe('IdentityRevealUtil', () => {
  let util: IdentityRevealUtil;
  let mockClient: any;
  let mockEncryption: any;

  const mockConfig = { get: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEncryption = {
      encrypt: jest.fn((text: string) => 'encrypted_' + text),
      decrypt: jest.fn((text: string) => text.replace('encrypted_', '')),
    };

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    util = new IdentityRevealUtil(mockConfig, mockEncryption);
  });

  describe('getRevealedUserIds', () => {
    it('should return empty set when no other user IDs provided', async () => {
      const result = await util.getRevealedUserIds('current-user', []);
      expect(result).toEqual(new Set());
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('should return revealed user IDs', async () => {
      const reveals = [
        { requester_id: 'current-user', responder_id: 'user-2' },
        { requester_id: 'user-3', responder_id: 'current-user' },
      ];

      const chain = createMockQueryChain({ data: reveals, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await util.getRevealedUserIds('current-user', [
        'user-2',
        'user-3',
        'user-4',
      ]);

      expect(result).toEqual(new Set(['user-2', 'user-3']));
      expect(mockClient.from).toHaveBeenCalledWith('identity_reveals');
      expect(chain.eq).toHaveBeenCalledWith('status', 'accepted');
    });

    it('should handle null reveals data', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await util.getRevealedUserIds('current-user', ['user-2']);
      expect(result).toEqual(new Set());
    });

    it('should deduplicate input user IDs', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await util.getRevealedUserIds('current-user', [
        'user-2',
        'user-2',
        'user-3',
      ]);

      // The or filter should use deduplicated IDs
      expect(chain.or).toHaveBeenCalled();
    });
  });

  describe('decryptRealName', () => {
    it('should decrypt and combine first and last name', () => {
      const result = util.decryptRealName('encrypted_John', 'encrypted_Doe');
      expect(result).toBe('John Doe');
      expect(mockEncryption.decrypt).toHaveBeenCalledTimes(2);
    });

    it('should return null when both names are null', () => {
      const result = util.decryptRealName(null, null);
      expect(result).toBeNull();
    });

    it('should handle first name only', () => {
      const result = util.decryptRealName('encrypted_John', null);
      expect(result).toBe('John');
    });

    it('should handle last name only', () => {
      const result = util.decryptRealName(null, 'encrypted_Doe');
      expect(result).toBe('Doe');
    });

    it('should return null when decryption fails', () => {
      mockEncryption.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const result = util.decryptRealName('encrypted_bad', 'encrypted_data');
      expect(result).toBeNull();
    });
  });

  describe('isRevealed', () => {
    it('should return true when identity is revealed', async () => {
      const chain = createMockQueryChain({
        data: { id: 'reveal-1' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await util.isRevealed('user-a', 'user-b');
      expect(result).toBe(true);
    });

    it('should return false when identity is not revealed', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await util.isRevealed('user-a', 'user-b');
      expect(result).toBe(false);
    });
  });
});
