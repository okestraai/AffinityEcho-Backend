import * as crypto from 'crypto';
import {
  CODE_RULES,
  CompanyVerificationService,
} from '../../modules/user/services/company-verification.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn() }));

const KEY = Buffer.alloc(32, 7);
const encryption = {
  encrypt: (v: string) => 'enc_' + v,
  decrypt: (v: string) => v,
  hmac: (v: string) => crypto.createHmac('sha256', KEY).update(v.toLowerCase().trim()).digest('hex'),
};

function pendingToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-id-1',
    token: '11111111-2222-3333-4444-555555555555',
    user_id: 'u1',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

describe('CompanyVerificationService code check', () => {
  let service: CompanyVerificationService;
  let mockClient: any;

  beforeEach(() => {
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new CompanyVerificationService(createMockConfigService() as any, encryption as any, {} as any);
  });

  it('makes a stable 6-digit code for each token', () => {
    const code = service.codeFor('11111111-2222-3333-4444-555555555555');
    expect(code).toMatch(/^\d{6}$/);
    expect(service.codeFor('11111111-2222-3333-4444-555555555555')).toBe(code);
    expect(service.codeFor('99999999-2222-3333-4444-555555555555')).not.toBe(code);
  });

  it('verifies the person with the right code', async () => {
    const token = pendingToken();
    const done = createMockQueryChain({ data: null, error: null });
    mockClient.from
      .mockReturnValueOnce(createMockQueryChain({ data: token, error: null }))
      .mockReturnValue(done);

    const result = await service.verifyCode('u1', service.codeFor(token.token));
    expect(result).toMatchObject({ success: true });
    expect(done.update).toHaveBeenCalledWith(expect.objectContaining({ is_company_verified: true }));
  });

  it('only looks at the signed-in person\'s own code', async () => {
    const chain = createMockQueryChain({ data: pendingToken(), error: null });
    mockClient.from.mockReturnValueOnce(chain).mockReturnValue(createMockQueryChain({ data: null, error: null }));
    await service.verifyCode('u1', '000000');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('says when no code is waiting', async () => {
    mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: null, error: null }));
    expect(await service.verifyCode('u1', '123456')).toMatchObject({ success: false, reason: 'no_code' });
  });

  it('refuses an expired code', async () => {
    const token = pendingToken({ expires_at: new Date(Date.now() - 1000).toISOString() });
    mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: token, error: null }));
    expect(await service.verifyCode('u1', service.codeFor(token.token))).toMatchObject({ reason: 'expired' });
  });

  describe('retry rules (same as the login code)', () => {
    let now: number;
    beforeEach(() => {
      now = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => now);
    });
    afterEach(() => jest.restoreAllMocks());

    const wrongFor = (token: string) => (service.codeFor(token) === '000000' ? '111111' : '000000');

    it(`asks for a ${CODE_RULES.waitMs / 60000}-minute wait after ${CODE_RULES.triesBeforeWait} wrong codes`, async () => {
      const token = pendingToken();
      mockClient.from.mockReturnValue(createMockQueryChain({ data: token, error: null }));
      const answers: string[] = [];
      for (let i = 0; i < CODE_RULES.triesBeforeWait; i++) {
        answers.push((await service.verifyCode('u1', wrongFor(token.token))).reason as string);
      }
      expect(answers).toEqual(['wrong_code', 'wrong_code', 'cooling_down']);
      const waiting = await service.verifyCode('u1', service.codeFor(token.token));
      expect(waiting).toMatchObject({ success: false, reason: 'cooling_down' });
      expect(waiting.message).toBe('Too many attempts. Try again in 5 minute(s).');

      now += CODE_RULES.waitMs + 1000;
      expect((await service.verifyCode('u1', wrongFor(token.token))).reason).toBe('wrong_code');
    });

    it(`stops for the day after ${CODE_RULES.maxTriesPerDay} wrong codes, even with new codes`, async () => {
      let token = pendingToken();
      mockClient.from.mockImplementation(() => createMockQueryChain({ data: token, error: null }));
      for (let i = 0; i < CODE_RULES.maxTriesPerDay; i++) {
        if (i > 0 && i % CODE_RULES.triesBeforeWait === 0) now += CODE_RULES.waitMs + 1000;
        await service.verifyCode('u1', wrongFor(token.token));
      }
      now += CODE_RULES.waitMs + 1000;
      // A resend replaces the token with a new one.
      token = pendingToken({ id: 'tok-id-2', token: '99999999-2222-3333-4444-555555555555' });
      expect(await service.verifyCode('u1', service.codeFor(token.token))).toMatchObject({ reason: 'too_many_tries' });

      now += 24 * 60 * 60 * 1000;
      expect((await service.verifyCode('u1', wrongFor(token.token))).reason).toBe('wrong_code');
    });

    it("counts each person's wrong codes separately", async () => {
      mockClient.from.mockReturnValue(createMockQueryChain({ data: pendingToken(), error: null }));
      for (let i = 0; i < CODE_RULES.triesBeforeWait; i++) await service.verifyCode('u1', '000000');
      const other = pendingToken({ user_id: 'u2' });
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: other, error: null }))
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));
      expect(await service.verifyCode('u2', service.codeFor(other.token))).toMatchObject({ success: true });
    });

    it('needs 30 seconds between sends and a 5-minute wait after 3 sends', async () => {
      await expect(service.assertCanSendCode('u1')).resolves.toBeUndefined();
      await (service as any).noteCodeSent('u1');
      await expect(service.assertCanSendCode('u1')).rejects.toThrow('Please wait 30 seconds');
      now += 31_000;
      await (service as any).noteCodeSent('u1');
      now += 31_000;
      await (service as any).noteCodeSent('u1');
      now += 31_000;
      await expect(service.assertCanSendCode('u1')).rejects.toThrow(/Try again in \d minute/);
      now += CODE_RULES.waitMs + 1000;
      await expect(service.assertCanSendCode('u1')).resolves.toBeUndefined();
    });
  });
});
