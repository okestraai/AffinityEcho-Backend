import { SpacesService } from '../../modules/spaces/spaces.service';
import { createMockConfigService } from './mock-supabase';

// A real SpacesService over the mocked database client; no forums are hidden unless a test says so.
export function createTestSpaces(encryption: any, enforce = false): SpacesService {
  const spaces = new SpacesService(
    createMockConfigService({
      SHELL_ACCESS_ENFORCE: enforce ? 'true' : 'false',
    }) as any,
    encryption,
  );
  jest.spyOn(spaces, 'closedForumIds').mockResolvedValue([]);
  return spaces;
}
