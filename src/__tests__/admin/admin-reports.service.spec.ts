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
jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn(),
  })),
);

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminReportsService } from '../../modules/admin/services/admin-reports.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminReportsService', () => {
  let service: AdminReportsService;
  let mockClient: any;
  const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminReportsService(
      createMockConfigService() as any,
      mockAdminUsers as any,
    );
  });

  describe('listReports', () => {
    it('should return paginated reports', async () => {
      const chain = createMockQueryChain({
        data: [
          {
            id: 'r1',
            reporter_id: 'u1',
            incident_type: 'harassment',
            status: 'submitted',
            created_at: '2026-01-01',
            assigned_to: null,
          },
        ],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);
      const result = await service.listReports('admin-1', {} as any);
      expect(result.success).toBe(true);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);
      await expect(service.listReports('admin-1', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getReportDetail', () => {
    it('should return report detail', async () => {
      // 1) fetch report 2) fetch timeline
      const reportChain = createMockQueryChain({
        data: {
          id: 'r1',
          reporter_id: 'u1',
          status: 'submitted',
          incident_type: 'harassment',
        },
        error: null,
      });
      const timelineChain = createMockQueryChain({ data: [], error: null });
      mockClient.from
        .mockReturnValueOnce(reportChain)
        .mockReturnValue(timelineChain);
      const result = await service.getReportDetail('r1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValue(chain);
      await expect(service.getReportDetail('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateReport', () => {
    it('should update report status', async () => {
      // 1) fetch report 2) update report 3) insert timeline 4) logAction
      const fetchChain = createMockQueryChain({
        data: { id: 'r1', status: 'submitted' },
        error: null,
      });
      const defaultChain = createMockQueryChain({
        data: { id: 'r1', status: 'under_review' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValue(defaultChain);
      const result = await service.updateReport('admin-1', 'Admin', 'r1', {
        status: 'under_review',
      });
      expect(result.success).toBe(true);
    });

    it('should throw if report not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValue(chain);
      await expect(
        service.updateReport('admin-1', 'Admin', 'nope', {
          status: 'resolved',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignToSelf', () => {
    it('should assign report to admin', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'r1', assigned_to: null },
        error: null,
      });
      const defaultChain = createMockQueryChain({
        data: { id: 'r1', assigned_to: 'admin-1' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValue(defaultChain);
      const result = await service.assignToSelf('admin-1', 'Admin', 'r1');
      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.assignToSelf('admin-1', 'Admin', 'r1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('listReports - filters', () => {
    it('should apply status filter', async () => {
      const listChain = createMockQueryChain({ data: [], error: null, count: 0 });
      const summaryChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(listChain).mockReturnValueOnce(summaryChain);

      const result = await service.listReports('admin-1', { status: 'submitted' } as any);
      expect(result.success).toBe(true);
      expect(listChain.eq).toHaveBeenCalledWith('status', 'submitted');
    });

    it('should throw for invalid incident type', async () => {
      await expect(
        service.listReports('admin-1', { type: 'invalid_type_xyz' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply critical priority filter', async () => {
      const listChain = createMockQueryChain({ data: [], error: null, count: 0 });
      const summaryChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(listChain).mockReturnValueOnce(summaryChain);

      const result = await service.listReports('admin-1', { priority: 'critical' } as any);
      expect(result.success).toBe(true);
      expect(listChain.eq).toHaveBeenCalledWith('immediate_risk', true);
    });

    it('should apply assignedTo=me filter', async () => {
      const listChain = createMockQueryChain({ data: [], error: null, count: 0 });
      const summaryChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(listChain).mockReturnValueOnce(summaryChain);

      const result = await service.listReports('admin-1', { assignedTo: 'me' } as any);
      expect(result.success).toBe(true);
      expect(listChain.eq).toHaveBeenCalledWith('assigned_to', 'admin-1');
    });

    it('should apply assignedTo=unassigned filter', async () => {
      const listChain = createMockQueryChain({ data: [], error: null, count: 0 });
      const summaryChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(listChain).mockReturnValueOnce(summaryChain);

      await service.listReports('admin-1', { assignedTo: 'unassigned' } as any);
      expect(listChain.is).toHaveBeenCalledWith('assigned_to', null);
    });

    it('should include summary counts in result', async () => {
      const listChain = createMockQueryChain({
        data: [{ id: 'r1', status: 'submitted', assigned_to: null, immediate_risk: true }],
        error: null,
        count: 1,
      });
      const summaryChain = createMockQueryChain({
        data: [
          { status: 'submitted', immediate_risk: true },
          { status: 'under_review', immediate_risk: false },
        ],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(listChain).mockReturnValueOnce(summaryChain);

      const result = await service.listReports('admin-1', {} as any);
      expect(result.success).toBe(true);
      expect(result.data.summary.submitted).toBe(1);
      expect(result.data.summary.critical).toBe(1);
    });
  });

  describe('exportReports', () => {
    it('should export CSV with data', async () => {
      const exportChain = createMockQueryChain({
        data: [{
          id: 'r1',
          reference_number: 'REP-001',
          incident_type: 'harassment',
          status: 'submitted',
          priority: 'high',
          immediate_risk: false,
          reporter: { username: 'User1', email: 'u1@test.com' },
          reported_user: { username: 'User2' },
          assigned_to: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          location: 'NYC',
          witnesses: null,
          evidence: null,
          description: 'Test description',
          resolution_action: null,
          admin_notes: null,
        }],
        error: null,
      });
      mockClient.from.mockReturnValue(exportChain);

      const result = await service.exportReports('admin-1', {} as any, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('.csv');
      expect(result.contentType).toContain('text/csv');
    });

    it('should export empty CSV when no reports', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.exportReports('admin-1', {} as any, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('harassment-reports');
    });

    it('should throw BadRequestException on DB error during export', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.exportReports('admin-1', {} as any, 'csv')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getReportDetail - with assigned admin', () => {
    it('should fetch assigned admin when report has assigned_to', async () => {
      const reportChain = createMockQueryChain({
        data: {
          id: 'r1',
          reporter_id: 'u1',
          status: 'submitted',
          incident_type: 'harassment',
          immediate_risk: true,
          assigned_to: 'admin-2',
        },
        error: null,
      });
      const timelineChain = createMockQueryChain({ data: [], error: null });
      const adminChain = createMockQueryChain({
        data: { id: 'admin-2', username: 'Admin2', avatar: null },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(reportChain)
        .mockReturnValueOnce(timelineChain)
        .mockReturnValueOnce(adminChain);

      const result = await service.getReportDetail('r1');
      expect(result.success).toBe(true);
      expect(result.data.priority).toBe('critical');
      expect(result.data.assigned_admin).toBeDefined();
    });
  });

  describe('updateReport - validation', () => {
    it('should throw BadRequestException for invalid status', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'r1', status: 'submitted', reporter_id: 'u1', reference_number: 'REP-001', reported_user_id: null },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.updateReport('admin-1', 'Admin', 'r1', { status: 'invalid_status' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when resolved without resolution_action', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'r1', status: 'submitted', reporter_id: 'u1', reference_number: 'REP-001', reported_user_id: null },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.updateReport('admin-1', 'Admin', 'r1', { status: 'resolved' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
