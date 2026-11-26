import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SpacesService, UserSpaces } from '../../modules/spaces/spaces.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('SpacesService', () => {
  let client: any;
  const encryption = {
    decrypt: jest.fn((t: string) => t.replace(/^enc_/, '')),
  };
  const build = (enforce = false) =>
    new SpacesService(
      createMockConfigService({ SHELL_ACCESS_ENFORCE: String(enforce) }) as any,
      encryption as any,
    );
  const profile = (data: any) =>
    client.from.mockReturnValueOnce(createMockQueryChain({ data, error: null }));
  const member = (over: Partial<UserSpaces> = {}): UserSpaces => ({
    company: 'Google',
    spaces: ['Google'],
    isStudent: false,
    isStaff: false,
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    client = createMockSupabaseClient().client;
    (supabaseAdmin as jest.Mock).mockReturnValue(client);
  });

  describe('forUser', () => {
    it('puts a typed company in Others and a student in Students', async () => {
      profile({
        role: 'user',
        company_encrypted: 'enc_Zenzi Bakery',
        company_type: 'other',
        company_alumni_encrypted: ['enc_Google'],
        is_student: true,
      });
      const user = await build().forUser('u1');
      expect(user.company).toBe('Others');
      expect(user.spaces).toEqual(['Others', 'Google', 'Students']);
      expect(user.isStudent).toBe(true);
    });

    it('uses a listed company by name and marks staff', async () => {
      profile({ role: 'moderator', company_encrypted: 'enc_Google', company_type: 'static' });
      const user = await build().forUser('u1');
      expect(user.company).toBe('Google');
      expect(user.spaces).toEqual(['Google']);
      expect(user.isStaff).toBe(true);
    });

    it('gives a member with no profile no spaces', async () => {
      profile(null);
      expect((await build().forUser('u1')).spaces).toEqual([]);
    });
  });

  describe('canSee', () => {
    const spaces = () => build();

    it('opens Global and Shared forums to everyone', () => {
      const s = spaces();
      expect(s.canSee(member({ spaces: [] }), { is_global: true })).toBe(true);
      expect(s.canSee(member({ spaces: [] }), { is_shared: true, is_global: true })).toBe(true);
      expect(s.canSee(member({ spaces: [] }), { company_name: null, scope: 'global' })).toBe(true);
    });

    it('keeps a company space to its members, ignoring case', () => {
      const s = spaces();
      expect(s.canSee(member(), { company_name: 'google', is_global: false })).toBe(true);
      expect(s.canSee(member(), { company_name: 'Meta', is_global: false })).toBe(false);
    });

    it('keeps Students to students', () => {
      const s = spaces();
      expect(s.canSee(member(), { company_name: 'Students' })).toBe(false);
      expect(
        s.canSee(member({ spaces: ['Google', 'Students'], isStudent: true }), { company_name: 'Students' }),
      ).toBe(true);
    });

    it('lets staff see every space', () => {
      expect(build().canSee(member({ isStaff: true, spaces: [] }), { company_name: 'Meta' })).toBe(true);
    });
  });

  describe('assertCanSee', () => {
    it('only logs while enforcement is off', () => {
      expect(() =>
        build(false).assertCanSee(member(), 'u1', { company_name: 'Meta' }, 'test'),
      ).not.toThrow();
    });

    it('refuses with 403 when enforcement is on', () => {
      expect(() =>
        build(true).assertCanSee(member(), 'u1', { company_name: 'Meta' }, 'test'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('audienceSpace', () => {
    it('maps each audience to its space', () => {
      const s = build();
      expect(s.audienceSpace(member(), 'everyone')).toBeNull();
      expect(s.audienceSpace(member(), 'company')).toBe('Google');
      expect(s.audienceSpace(member({ isStudent: true }), 'students')).toBe('Students');
    });

    it('refuses Students to non-students and company to members with none', () => {
      const s = build();
      expect(() => s.audienceSpace(member(), 'students')).toThrow(ForbiddenException);
      expect(() => s.audienceSpace(member({ company: null }), 'company')).toThrow(BadRequestException);
    });
  });

  describe('forumFor', () => {
    it("treats a hidden forum as missing for members", async () => {
      client.from
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'f1', is_global: true, is_hidden: true }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { role: 'user' }, error: null }));
      await expect(build().forumFor('u1', 'f1', 'test')).rejects.toThrow(NotFoundException);
    });

    it('shows a hidden forum to staff', async () => {
      client.from
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'f1', is_global: true, is_hidden: true }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { role: 'admin' }, error: null }));
      const { forum } = await build().forumFor('u1', 'f1', 'test');
      expect(forum.id).toBe('f1');
    });

    it("refuses another company's forum when enforcement is on", async () => {
      client.from
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'f1', is_global: false, company_name: 'Meta' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { role: 'user', company_encrypted: 'enc_Google', company_type: 'static' }, error: null }));
      await expect(build(true).forumFor('u1', 'f1', 'test')).rejects.toThrow(ForbiddenException);
    });
  });
});
