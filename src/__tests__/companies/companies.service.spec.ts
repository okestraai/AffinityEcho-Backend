import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
    forums = {
      bootstrapFoundationForums: jest.fn().mockResolvedValue({ success: true }),
    };
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

    it("uses a hidden company's own space for a typed match", async () => {
      const list = createMockQueryChain({
        data: [{ id: 'c2', name: 'Netflix' }],
        error: null,
      });
      client.from.mockReturnValueOnce(list);
      const result = await service.resolve('netflix');
      expect(result.columns.company_type).toBe('static');
      // Hidden companies count too, so the lookup must not be limited to shown ones.
      expect(list.eq).not.toHaveBeenCalledWith('is_active', true);
    });

    it('uses an existing company forum space that is not on the list', async () => {
      client.from
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(
          createMockQueryChain({
            data: [{ company_name: 'Acme Ltd' }],
            error: null,
          }),
        );
      const result = await service.resolve('acme ltd');
      expect(result.name).toBe('Acme Ltd');
      expect(result.columns.company_type).toBe('static');
    });

    it('fails clearly when the list cannot be read', async () => {
      client.from.mockReturnValueOnce(
        createMockQueryChain({ data: null, error: { message: 'down' } }),
      );
      await expect(service.resolve('Google')).rejects.toThrow(
        ServiceUnavailableException,
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
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
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
      // Only members still on that typed company are moved.
      expect(update.eq).toHaveBeenCalledWith(
        'company_key',
        service.companyKey('Dangote'),
      );
    });

    it('keeps nothing when the forums cannot be created', async () => {
      forums.bootstrapFoundationForums.mockResolvedValueOnce({
        success: false,
      });
      const remove = createMockQueryChain({ data: null, error: null });
      client.from
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(
          createMockQueryChain({
            data: { id: 'c9', name: 'Dangote' },
            error: null,
          }),
        )
        .mockReturnValueOnce(remove);
      await expect(service.addCompany('Dangote', 'admin')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(remove.delete).toHaveBeenCalled();
      expect(remove.eq).toHaveBeenCalledWith('id', 'c9');
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
      client.from
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: rows, error: null }));
      expect(await service.suggestions()).toEqual([
        { name: 'Dangote', members: 5 },
      ]);
    });
  });

  describe('older typed companies', () => {
    it('gives members who typed a company before keys existed a key', async () => {
      const update = createMockQueryChain({ data: null, error: null });
      client.from
        .mockReturnValueOnce(
          createMockQueryChain({
            data: [{ id: 'u7', company_encrypted: 'enc_Indomie' }],
            error: null,
          }),
        )
        .mockReturnValueOnce(update)
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }));
      await service.suggestions();
      expect(update.update).toHaveBeenCalledWith({
        company_key: service.companyKey('Indomie'),
      });
    });

    it('moves typed members when a hidden company is shown again', async () => {
      const update = createMockQueryChain({ data: null, error: null });
      client.from
        .mockReturnValueOnce(
          createMockQueryChain({
            data: { id: 'c2', name: 'Netflix', is_active: true },
            error: null,
          }),
        )
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(
          createMockQueryChain({ data: [{ id: 'u3' }], error: null }),
        )
        .mockReturnValue(update);
      await service.setActive('c2', true);
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({
          company_type: 'static',
          company_encrypted: 'enc_Netflix',
        }),
      );
    });
  });
});
