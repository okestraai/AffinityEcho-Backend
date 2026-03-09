import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { CreateHarassmentReportDto } from '../dto/update-profile.dto';

@Injectable()
export class HarassmentReportService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  private generateReferenceNumber(): string {
    const prefix = 'HR';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  async createReport(userId: string, dto: CreateHarassmentReportDto) {
    logger.info('Creating harassment report', {
      userId,
      incidentType: dto.incidentType,
    });

    try {
      const referenceNumber = this.generateReferenceNumber();

      const { data, error } = await this.admin
        .from('harassment_reports')
        .insert({
          reporter_id: userId,
          reference_number: referenceNumber,
          incident_type: dto.incidentType,
          description: dto.description,
          date: dto.date || null,
          location: dto.location || null,
          witnesses: dto.witnesses || null,
          evidence: dto.evidence || null,
          reporter_type: dto.reporterType,
          contact_email: dto.contactEmail || null,
          immediate_risk: dto.immediateRisk,
          reported_user_id: dto.reportedUserId || null,
          status: 'submitted',
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create harassment report', { error });
        throw new BadRequestException('Failed to submit report');
      }

      logger.info('Harassment report created', {
        reportId: data.id,
        referenceNumber,
        immediateRisk: dto.immediateRisk,
        reportedUserId: dto.reportedUserId,
      });

      return {
        success: true,
        data: {
          id: data.id,
          referenceNumber: data.reference_number,
          status: data.status,
          immediateRisk: data.immediate_risk,
          reportedUserId: data.reported_user_id,
          createdAt: data.created_at,
        },
        message: dto.immediateRisk
          ? 'Report submitted. Due to immediate risk, this has been flagged for urgent review. If you are in danger, please call 911.'
          : 'Report submitted successfully. Our team will review it within 24-48 hours.',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to create harassment report', { error });
      throw new BadRequestException('Failed to submit report');
    }
  }

  async getUserReports(userId: string, page = 1, limit = 10, status?: string) {
    logger.info('Fetching user harassment reports', { userId, status });

    try {
      const offset = (page - 1) * limit;

      // Build filtered query
      let query = this.admin
        .from('harassment_reports')
        .select(
          `*,
          reported_user:user_profiles!reported_user_id(id, username, avatar)`,
          { count: 'exact' },
        )
        .eq('reporter_id', userId);

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new BadRequestException('Failed to fetch reports');
      }

      // Get summary counts (unfiltered, grouped by status)
      const { data: allReports } = await this.admin
        .from('harassment_reports')
        .select('status, immediate_risk')
        .eq('reporter_id', userId);

      const summary: Record<string, number> = {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      };

      (allReports || []).forEach((r: any) => {
        summary.total++;
        summary[r.status] = (summary[r.status] || 0) + 1;

        // Calculate priority counts
        if (r.immediate_risk) {
          summary.critical++;
        } else if (r.status === 'submitted') {
          summary.high++;
        } else if (r.status === 'under_review') {
          summary.medium++;
        } else if (r.status === 'resolved' || r.status === 'declined') {
          summary.low++;
        }
      });

      return {
        success: true,
        data: {
          reports: (data || []).map((report: any) => {
            // Determine priority
            let priority = 'low';
            if (report.immediate_risk) {
              priority = 'critical';
            } else if (report.status === 'submitted') {
              priority = 'high';
            } else if (report.status === 'under_review') {
              priority = 'medium';
            }

            return {
              id: report.id,
              referenceNumber: report.reference_number,
              incidentType: report.incident_type,
              description: report.description,
              date: report.date,
              location: report.location,
              reporterType: report.reporter_type,
              immediateRisk: report.immediate_risk,
              priority,
              status: report.status,
              reportedUser: report.reported_user,
              createdAt: report.created_at,
              updatedAt: report.updated_at,
            };
          }),
          summary,
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to fetch harassment reports', { error });
      throw new BadRequestException('Failed to fetch reports');
    }
  }

  async getReportByReference(userId: string, referenceNumber: string) {
    logger.info('Fetching harassment report by reference', {
      userId,
      referenceNumber,
    });

    try {
      const { data, error } = await this.admin
        .from('harassment_reports')
        .select(
          `*,
          reported_user:user_profiles!reported_user_id(id, username, avatar)`,
        )
        .eq('reporter_id', userId)
        .eq('reference_number', referenceNumber)
        .single();

      if (error || !data) {
        throw new NotFoundException('Report not found');
      }

      // Determine priority
      let priority = 'low';
      if (data.immediate_risk) {
        priority = 'critical';
      } else if (data.status === 'submitted') {
        priority = 'high';
      } else if (data.status === 'under_review') {
        priority = 'medium';
      }

      return {
        success: true,
        data: {
          id: data.id,
          referenceNumber: data.reference_number,
          incidentType: data.incident_type,
          description: data.description,
          date: data.date,
          location: data.location,
          witnesses: data.witnesses,
          evidence: data.evidence,
          reporterType: data.reporter_type,
          contactEmail: data.contact_email,
          immediateRisk: data.immediate_risk,
          priority,
          status: data.status,
          reportedUser: data.reported_user,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          resolvedAt: data.resolved_at,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error('Failed to fetch harassment report', { error });
      throw new BadRequestException('Failed to fetch report');
    }
  }

  async getReportById(userId: string, reportId: string) {
    logger.info('Fetching harassment report by ID', { userId, reportId });

    try {
      const { data, error } = await this.admin
        .from('harassment_reports')
        .select(
          `*,
          reported_user:user_profiles!reported_user_id(id, username, avatar, email, role)`,
        )
        .eq('reporter_id', userId)
        .eq('id', reportId)
        .single();

      if (error || !data) {
        throw new NotFoundException('Report not found');
      }

      // Determine priority
      let priority = 'low';
      if (data.immediate_risk) {
        priority = 'critical';
      } else if (data.status === 'submitted') {
        priority = 'high';
      } else if (data.status === 'under_review') {
        priority = 'medium';
      }

      // Build timeline from available timestamp fields
      const timeline: Array<{ event: string; date: string }> = [];
      if (data.created_at) {
        timeline.push({ event: 'Report submitted', date: data.created_at });
      }
      if (data.updated_at && data.updated_at !== data.created_at) {
        timeline.push({ event: 'Report updated', date: data.updated_at });
      }
      if (data.resolved_at) {
        timeline.push({ event: 'Report resolved', date: data.resolved_at });
      }
      timeline.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      return {
        success: true,
        data: {
          id: data.id,
          referenceNumber: data.reference_number,
          incidentType: data.incident_type,
          description: data.description,
          date: data.date,
          location: data.location,
          witnesses: data.witnesses,
          evidence: data.evidence,
          reporterType: data.reporter_type,
          contactEmail: data.contact_email,
          immediateRisk: data.immediate_risk,
          priority,
          status: data.status,
          reportedUser: data.reported_user,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          resolvedAt: data.resolved_at,
          timeline,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error('Failed to fetch harassment report', { error });
      throw new BadRequestException('Failed to fetch report');
    }
  }
}
