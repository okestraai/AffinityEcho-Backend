import * as crypto from 'crypto';
import {
  CompanyVerificationService,
  MAX_CODE_TRIES,
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

  it(`stops after ${MAX_CODE_TRIES} wrong codes, even if the right one comes next`, async () => {
    const token = pendingToken();
    const wrong = service.codeFor(token.token) === '000000' ? '111111' : '000000';
    mockClient.from.mockReturnValue(createMockQueryChain({ data: token, error: null }));
    const reasons: string[] = [];
    for (let i = 0; i < MAX_CODE_TRIES; i++) {
      reasons.push((await service.verifyCode('u1', wrong)).reason as string);
    }
    expect(reasons.slice(0, -1).every((r) => r === 'wrong_code')).toBe(true);
    expect(reasons[reasons.length - 1]).toBe('too_many_tries');
    expect(await service.verifyCode('u1', service.codeFor(token.token))).toMatchObject({
      success: false,
      reason: 'too_many_tries',
    });
  });
});
