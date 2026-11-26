import { NotFoundException } from '@nestjs/common';

// Takes a member out of Students. Their school is kept as a past school.
export async function endStudentStatus(
  admin: any,
  userId: string,
): Promise<boolean> {
  const { data: current } = await admin
    .from('user_profiles')
    .select('is_student, school_encrypted')
    .eq('id', userId)
    .maybeSingle();
  if (!current) throw new NotFoundException('User not found');
  if (!current.is_student) return false;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    is_student: false,
    school_encrypted: null,
    expected_grad_year: null,
    student_status_checked_at: now,
    updated_at: now,
  };
  if (current.school_encrypted)
    update.school_alumni_encrypted = current.school_encrypted;

  const { data } = await admin
    .from('user_profiles')
    .update(update)
    .eq('id', userId)
    .eq('is_student', true)
    .select('id');
  const ended = (data ?? []).length > 0;
  if (ended) {
    // Their Students forum memberships go too, so those forums leave their lists.
    const { data: forums } = await admin
      .from('forums')
      .select('id')
      .eq('company_name', 'Students');
    const ids = (forums ?? []).map((f: { id: string }) => f.id);
    if (ids.length) {
      await admin
        .from('forum_members')
        .delete()
        .eq('user_id', userId)
        .in('forum_id', ids);
    }
  }
  return ended;
}
