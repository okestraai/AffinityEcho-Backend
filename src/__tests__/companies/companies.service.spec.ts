import { BadRequestException, ConflictException } from '@nestjs/common';
import { CompaniesService } from '../../modules/companies/companies.service';
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
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CompaniesService', () => {
  let service: CompaniesService;
  let client: any;
  let forums: { bootstrapFoundationForums: jest.Mock };
  const encryption = {
    encrypt: jest.fn((t: string) => 'enc_' + t),
    decrypt: jest.fn((t: string) => t.replace(/^enc_/, '')),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = createMockSupabaseClient().client;
    (supabaseAdmin as jest.Mock).mockReturnValue(client);
    forums = { bootstrapFoundationForums: jest.fn().mockResolvedValue({}) };
    service = new CompaniesService(
      createMockConfigService({ ENCRYPTION_KEY: 'k'.repeat(44) }) as any,
      encryption as any,
      forums as any,
    );
  });

  describe('resolve', () => {
    it('uses the listed spelling and marks a listed company as static', async () => {
      client.from.mockReturnValueOnce(
        createMockQueryChain({
          data: [{ id: 'c1', name: 'Google' }],
          error: null,
        }),
      );
      const result = await service.resolve('  google ');
      expect(result.name).toBe('Google');
      expect(result.columns).toEqual({
        company_encrypted: 'enc_Google',
        company_type: 'static',
        company_key: null,
      });
    });

    it('marks a typed company as other, tidies it and gives it a key', async () => {
      client.from.mockReturnValueOnce(
        createMockQueryChain({ data: [], error: null }),
      );
      const result = await service.resolve('dangote   group');
      expect(result.name).toBe('Dangote Group');
      expect(result.columns.company_type).toBe('other');
      expect(result.columns.company_key).toBe(
        service.companyKey('Dangote Group'),
      );
    });

    it.each(['Students', 'others', 'Other Companies'])(
      'refuses the space name %s',
      async (name) => {
        await expect(service.resolve(name)).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it('refuses names that are too short', async () => {
      await expect(service.resolve('x')).rejects.toThrow(BadRequestException);
    });
  });

  describe('companyKey', () => {
    it('ignores case, spaces and punctuation', () => {
      expect(service.companyKey('Dangote Group')).toBe(
        service.companyKey('dangote-group'),
      );
      expect(service.companyKey('Dangote Group')).not.toBe(
        service.companyKey('MTN'),
      );
    });

    it('never contains the name', () => {
      expect(service.companyKey('Dangote')).not.toContain('dangote');
    });
  });

  describe('addCompany', () => {
    it('refuses a company that is already listed', async () => {
      client.from.mockReturnValueOnce(
        createMockQueryChain({ data: [{ id: 'c1' }], error: null }),
      );
      await expect(service.addCompany('google', 'admin')).rejects.toThrow(
        ConflictException,
      );
    });

    it('adds the company, creates its forums and moves members who typed it', async () => {
      const update = createMockQueryChain({ data: null, error: null });
      client.from
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(
          createMockQueryChain({
            data: { id: 'c9', name: 'Dangote', is_active: true },
            error: null,
          }),
        )
        .mockReturnValueOnce(
          createMockQueryChain({
            data: [{ id: 'u1' }, { id: 'u2' }],
            error: null,
          }),
        )
        .mockReturnValue(update);
      const result = await service.addCompany('Dangote', 'admin');
      expect(forums.bootstrapFoundationForums).toHaveBeenCalledWith('Dangote');
      expect(result.membersMoved).toBe(2);
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({
          company_encrypted: 'enc_Dangote',
          company_type: 'static',
          company_key: null,
        }),
      );
    });
  });

  describe('suggestions', () => {
    it('lists typed companies shared by at least 5 members', async () => {
      const rows = [
        ...Array.from({ length: 5 }, () => ({
          company_key: 'a',
          company_encrypted: 'enc_Dangote',
        })),
        ...Array.from({ length: 4 }, () => ({
          company_key: 'b',
          company_encrypted: 'enc_MTN',
        })),
      ];
      client.from.mockReturnValueOnce(
        createMockQueryChain({ data: rows, error: null }),
      );
      expect(await service.suggestions()).toEqual([
        { name: 'Dangote', members: 5 },
      ]);
    });
  });
});
