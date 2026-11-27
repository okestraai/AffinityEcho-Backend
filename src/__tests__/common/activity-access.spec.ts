import { canSeeActivity } from '../../common/utils/activity-access';
import { createMockQueryChain } from '../helpers/mock-supabase';

const adminWith = (profile: any, block: any = null, follow: any = null) => {
  const from = jest.fn((table: string) =>
    createMockQueryChain({
      data: table === 'user_profiles' ? profile : table === 'user_blocks' ? block : follow,
      error: null,
    }),
  );
  return { from } as any;
};

describe('canSeeActivity', () => {
  const open = { profile_visibility: 'public', show_activity: true, is_deleted: false, is_deactivated: false };

  it('always lets members see their own activity', async () => {
    const admin = adminWith(null);
    expect(await canSeeActivity(admin, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('shows a public profile with activity on', async () => {
    expect(await canSeeActivity(adminWith(open), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')).toBe(true);
  });

  it('hides activity when either member blocked the other', async () => {
    expect(await canSeeActivity(adminWith(open, { id: 'b1' }), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')).toBe(false);
  });

  it('hides activity the member switched off, and private profiles', async () => {
    expect(await canSeeActivity(adminWith({ ...open, show_activity: false }), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')).toBe(false);
    expect(await canSeeActivity(adminWith({ ...open, profile_visibility: 'private' }), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')).toBe(false);
  });

  it('shows a connections-only profile to followers only', async () => {
    const connections = { ...open, profile_visibility: 'connections' };
    expect(await canSeeActivity(adminWith(connections), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')).toBe(false);
    expect(await canSeeActivity(adminWith(connections, null, { id: 'f1' }), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')).toBe(true);
  });

  it('refuses an id that could change the block lookup', async () => {
    const admin = adminWith(open);
    expect(await canSeeActivity(admin, 'x),and(blocker_id.eq.y', '00000000-0000-4000-8000-000000000002')).toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('hides deleted and deactivated members', async () => {
    expect(await canSeeActivity(adminWith({ ...open, is_deactivated: true }), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')).toBe(false);
    expect(await canSeeActivity(adminWith(null), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')).toBe(false);
  });
});
