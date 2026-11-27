import { isUUID } from 'class-validator';
import type { SupabaseAdapter } from '../../database/query-builder';

// Whether a viewer may see another member's activity: not blocked either way, and the
// profile is public (or they follow a connections-only profile) with activity switched on.
export async function canSeeActivity(
  admin: SupabaseAdapter,
  targetUserId: string,
  viewerId?: string,
): Promise<boolean> {
  if (!viewerId || viewerId === targetUserId) return true;
  // The ids go into a filter expression, so anything that isn't an id is refused first.
  if (!isUUID(targetUserId) || !isUUID(viewerId)) return false;
  const [{ data: profile }, { data: block }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('profile_visibility, show_activity, is_deleted, is_deactivated')
      .eq('id', targetUserId)
      .maybeSingle(),
    admin
      .from('user_blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${viewerId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${viewerId})`,
      )
      .maybeSingle(),
  ]);
  if (!profile || profile.is_deleted || profile.is_deactivated || block)
    return false;
  if (profile.show_activity === false) return false;
  const visibility = profile.profile_visibility || 'public';
  if (visibility === 'private') return false;
  if (visibility === 'connections') {
    const { data: follow } = await admin
      .from('user_follows')
      .select('id')
      .eq('follower_id', viewerId)
      .eq('following_id', targetUserId)
      .maybeSingle();
    return !!follow;
  }
  return true;
}
