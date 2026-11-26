import { NotFoundException } from '@nestjs/common';
import { endStudentStatus } from '../../modules/spaces/student-status';
import { createMockQueryChain } from '../helpers/mock-supabase';

describe('endStudentStatus', () => {
  const client = (profile: any, updated: any[] = [{ id: 'u1' }]) => {
    const read = createMockQueryChain({ data: profile, error: null });
    const update = createMockQueryChain({ data: updated, error: null });
    const from = jest.fn().mockReturnValueOnce(read).mockReturnValueOnce(update);
    return { admin: { from }, update };
  };

  it('keeps the school as a past school and leaves Students', async () => {
    const { admin, update } = client({ is_student: true, school_encrypted: 'enc_UNILAG' });
    expect(await endStudentStatus(admin, 'u1')).toBe(true);
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_student: false,
        school_encrypted: null,
        school_alumni_encrypted: 'enc_UNILAG',
        expected_grad_year: null,
      }),
    );
    // Only a row that is still a student changes.
    expect(update.eq).toHaveBeenCalledWith('is_student', true);
  });

  it('does nothing for a member who is not a student', async () => {
    const { admin, update } = client({ is_student: false });
    expect(await endStudentStatus(admin, 'u1')).toBe(false);
    expect(update.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown member', async () => {
    const { admin } = client(null);
    await expect(endStudentStatus(admin, 'nope')).rejects.toThrow(NotFoundException);
  });
});
