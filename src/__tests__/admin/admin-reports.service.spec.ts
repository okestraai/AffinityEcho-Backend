jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('pdfkit', () => jest.fn().mockImplementation(() => ({ pipe: jest.fn(), text: jest.fn().mockReturnThis(), moveDown: jest.fn().mockReturnThis(), fontSize: jest.fn().mockReturnThis(), font: jest.fn().mockReturnThis(), end: jest.fn(), on: jest.fn() })));

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminReportsService } from '../../modules/admin/services/admin-reports.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('AdminReportsService', () => {
  let service: AdminReportsService;
  let mockClient: any;

  const mockReport = {
    id: 'r1', reference_number: 'REF-001', incident_type: 'harassment',
    status: 'submitted', immediate_risk: false, description: 'Test report',
    created_at: '2026-05-01', assigned_to: null,
    reporter: { id: 'u1', username: 'Reporter', avatar: '🔥' },
    reported_user: { id: 'u2', username: 'Reported', avatar: '📚' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };
    service = new AdminReportsService(createMockConfigService() as any, mockAdminUsers as any);
  });

  describe('listReports', () => {
    it.skip('should return paginated reports', async () => {
      const chain = createMockQueryChain({ data: [mockReport], error: null, count: 1 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listReports({} as any);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it.skip('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listReports({} as any);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it.skip('should filter by status', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.listReports({ status: 'submitted' } as any);
      expect(chain.eq).toHaveBeenCalledWith('status', 'submitted');
    });

    it.skip('should filter by incident type', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.listReports({ incidentType: 'harassment' } as any);
      expect(chain.eq).toHaveBeenCalledWith('incident_type', 'harassment');
    });

    it.skip('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.listReports({} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getReport', () => {
    it.skip('should return report by ID', async () => {
      const chain = createMockQueryChain({ data: mockReport, error: null });
      const timelineChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain).mockReturnValueOnce(timelineChain);

      const result = await service.getReport('r1');
      expect(result.success).toBe(true);
    });

    it.skip('should throw if report not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getReport('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateReportStatus', () => {
    it.skip('should update report status', async () => {
      const fetchChain = createMockQueryChain({ data: mockReport, error: null });
      const updateChain = createMockQueryChain({ data: { ...mockReport, status: 'investigating' }, error: null });
      const timelineChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(timelineChain)
        .mockReturnValueOnce(logChain);

      const result = await service.updateReportStatus('r1', 'admin-1', { status: 'investigating' } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should throw if report not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.updateReportStatus('nope', 'admin-1', { status: 'investigating' } as any)).rejects.toThrow(NotFoundException);
    });
  });
});
