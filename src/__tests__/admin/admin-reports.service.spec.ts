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
  });
});
