import { NotFoundException } from '@nestjs/common';
import { endStudentStatus } from '../../modules/spaces/student-status';
import { createMockQueryChain } from '../helpers/mock-supabase';

describe('endStudentStatus', () => {
  const client = (profile: any, updated: any[] = [{ id: 'u1' }]) => {
    const read = createMockQueryChain({ data: profile, error: null });
    const update = createMockQueryChain({ data: updated, error: null });
    const forums = createMockQueryChain({ data: [{ id: 'sf1' }, { id: 'sf2' }], error: null });
    const members = createMockQueryChain({ data: null, error: null });
    const from = jest
      .fn()
      .mockReturnValueOnce(read)
      .mockReturnValueOnce(update)
      .mockReturnValueOnce(forums)
      .mockReturnValueOnce(members);
    return { admin: { from }, update, forums, members };
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

  it('leaves the Students forums too', async () => {
    const { admin, forums, members } = client({ is_student: true, school_encrypted: null });
    await endStudentStatus(admin, 'u1');
    expect(forums.eq).toHaveBeenCalledWith('company_name', 'Students');
    expect(members.delete).toHaveBeenCalled();
    expect(members.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(members.in).toHaveBeenCalledWith('forum_id', ['sf1', 'sf2']);
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
