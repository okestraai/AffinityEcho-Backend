jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { HarassmentReportService } from '../../modules/user/services/harassment-report.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('HarassmentReportService', () => {
  let service: HarassmentReportService;
  let mockClient: any;

  const mockReport = {
    id: 'r1', reporter_id: 'u1', reference_number: 'HR-ABC123',
    incident_type: 'harassment', description: 'Test report',
    status: 'submitted', created_at: '2026-05-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new HarassmentReportService(createMockConfigService() as any);
  });

  describe('createReport', () => {
    it.skip('should create harassment report', async () => {
      const insertChain = createMockQueryChain({ data: mockReport, error: null });
      mockClient.from.mockReturnValue(insertChain);

      const result = await service.createReport('u1', {
        incidentType: 'harassment',
        description: 'Test report',
        reporterType: 'target',
        immediateRisk: false,
      } as any);
      expect(result.success).toBe(true);
      expect(result.data.reference_number).toBeDefined();
    });

    it('should throw on insert error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.createReport('u1', {
        incidentType: 'harassment', description: 'Test', reporterType: 'target', immediateRisk: false,
      } as any)).rejects.toThrow(BadRequestException);
    });

    it('should generate unique reference number', async () => {
      const insertChain = createMockQueryChain({ data: mockReport, error: null });
      mockClient.from.mockReturnValue(insertChain);

      await service.createReport('u1', {
        incidentType: 'discrimination', description: 'Test', reporterType: 'witness', immediateRisk: true,
      } as any);

      // Verify insert was called with a reference_number starting with HR-
      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.reference_number).toMatch(/^HR-/);
    });

    it('should handle optional fields', async () => {
      const insertChain = createMockQueryChain({ data: mockReport, error: null });
      mockClient.from.mockReturnValue(insertChain);

      await service.createReport('u1', {
        incidentType: 'harassment', description: 'Test',
        reporterType: 'target', immediateRisk: false,
        date: '2026-05-01', location: 'Office',
        witnesses: 'John', evidence: 'screenshot.png',
        contactEmail: 'user@test.com', reportedUserId: 'u2',
      } as any);

      const insertCall = insertChain.insert.mock.calls[0][0];
      expect(insertCall.location).toBe('Office');
      expect(insertCall.reported_user_id).toBe('u2');
    });
  });

  describe('getMyReports', () => {
    it.skip('should return user reports', async () => {
      const chain = createMockQueryChain({ data: [mockReport], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getUserReports('u1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it.skip('should return empty array when no reports', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getUserReports('u1');
      expect(result.data).toEqual([]);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getUserReports('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getReport', () => {
    it('should return report by ID for reporter', async () => {
      const chain = createMockQueryChain({ data: mockReport, error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getReportById('u1', 'r1');
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('r1');
    });

    it('should throw if report not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getReportById('u1', 'nope')).rejects.toThrow(NotFoundException);
    });
  });
});
