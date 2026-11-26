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
  return (data ?? []).length > 0;
}
