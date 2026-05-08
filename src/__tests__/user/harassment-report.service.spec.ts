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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HarassmentReportService } from '../../modules/user/services/harassment-report.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('HarassmentReportService', () => {
  let service: HarassmentReportService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new HarassmentReportService(createMockConfigService() as any);
  });

  describe('createReport', () => {
    it('should create report successfully', async () => {
      const insertChain = createMockQueryChain({
        data: {
          id: 'r1',
          reference_number: 'HR-ABC123',
          status: 'submitted',
          immediate_risk: false,
          reported_user_id: null,
          created_at: '2026-05-01',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(insertChain);

      const result = await service.createReport('u1', {
        incidentType: 'harassment',
        description: 'Test report',
      } as any);

      expect(result.success).toBe(true);
      expect(result.data.referenceNumber).toBe('HR-ABC123');
      expect(result.data.status).toBe('submitted');
    });

    it('should throw on insert error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.createReport('u1', {
          incidentType: 'harassment',
          description: 'Test',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserReports', () => {
    it('should return user reports with summary', async () => {
      const reportsChain = createMockQueryChain({
        data: [
          {
            id: 'r1',
            reference_number: 'HR-ABC123',
            incident_type: 'harassment',
            description: 'Test report',
            status: 'submitted',
            immediate_risk: false,
            date: null,
            location: null,
            reporter_type: null,
            reported_user: null,
            created_at: '2026-05-01',
            updated_at: null,
          },
        ],
        error: null,
        count: 1,
      });
      const summaryChain = createMockQueryChain({
        data: [{ status: 'submitted', immediate_risk: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(reportsChain)
        .mockReturnValueOnce(summaryChain);

      const result = await service.getUserReports('u1');
      expect(result.success).toBe(true);
      expect(result.data.reports).toHaveLength(1);
      expect(result.data.reports[0].referenceNumber).toBe('HR-ABC123');
      expect(result.data.reports[0].priority).toBe('high');
      expect(result.data.summary.total).toBe(1);
      expect(result.data.summary.submitted).toBe(1);
    });

    it('should return empty when no reports', async () => {
      const reportsChain = createMockQueryChain({
        data: [],
        error: null,
        count: 0,
      });
      const summaryChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(reportsChain)
        .mockReturnValueOnce(summaryChain);

      const result = await service.getUserReports('u1');
      expect(result.data.reports).toEqual([]);
      expect(result.data.summary.total).toBe(0);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getUserReports('u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getReportByReference', () => {
    it('should return report by reference number', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'r1',
          reference_number: 'HR-ABC123',
          incident_type: 'harassment',
          description: 'Test',
          status: 'submitted',
          immediate_risk: false,
          reported_user: null,
          created_at: '2026-05-01',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getReportByReference('u1', 'HR-ABC123');
      expect(result.success).toBe(true);
      expect(result.data.referenceNumber).toBe('HR-ABC123');
    });

    it('should throw NotFoundException when not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.getReportByReference('u1', 'HR-NOPE'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getReportById', () => {
    it('should return report by ID', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'r1',
          reference_number: 'HR-ABC123',
          incident_type: 'harassment',
          description: 'Test',
          status: 'submitted',
          immediate_risk: false,
          reported_user: null,
          created_at: '2026-05-01',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getReportById('u1', 'r1');
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('r1');
    });

    it('should throw NotFoundException when not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getReportById('u1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
