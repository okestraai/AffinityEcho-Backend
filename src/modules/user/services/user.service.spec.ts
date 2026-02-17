jest.mock('../../../database/supabase.client', () => ({
  supabaseClient: jest.fn(),
}));

import { UserService } from './user.service';
import { supabaseClient } from '../../../database/supabase.client';
import {
  createMockQueryChain,
  createMockSupabaseClient,
} from '../../../__tests__/helpers/mock-supabase';

describe('UserService', () => {
  let service: UserService;
  let mockClient: any;

  const mockConfig = { get: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseClient as jest.Mock).mockReturnValue(mockClient);

    service = new UserService(mockConfig);
  });

  describe('getProfile', () => {
    it('should return user profile on success', async () => {
      const mockProfile = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        avatar: 'avatar.png',
      };

      const chain = createMockQueryChain({
        data: mockProfile,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getProfile('user-123');

      expect(result).toEqual(mockProfile);
      expect(mockClient.from).toHaveBeenCalledWith('user_profiles');
      expect(chain.eq).toHaveBeenCalledWith('id', 'user-123');
      expect(chain.single).toHaveBeenCalled();
    });

    it('should throw when supabase returns an error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'Not found', code: 'PGRST116' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getProfile('nonexistent')).rejects.toEqual({
        message: 'Not found',
        code: 'PGRST116',
      });
    });
  });

  describe('updateProfile', () => {
    it('should update and return profile on success', async () => {
      const updates = { bio: 'New bio', job_title: 'Engineer' };
      const updatedProfile = {
        id: 'user-123',
        username: 'testuser',
        bio: 'New bio',
        job_title: 'Engineer',
      };

      const chain = createMockQueryChain({
        data: updatedProfile,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.updateProfile('user-123', updates);

      expect(result).toEqual(updatedProfile);
      expect(mockClient.from).toHaveBeenCalledWith('user_profiles');
      expect(chain.update).toHaveBeenCalledWith(updates);
      expect(chain.eq).toHaveBeenCalledWith('id', 'user-123');
      expect(chain.single).toHaveBeenCalled();
    });

    it('should throw when update fails', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'Update failed' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.updateProfile('user-123', { bio: 'test' }),
      ).rejects.toEqual({ message: 'Update failed' });
    });
  });
});
