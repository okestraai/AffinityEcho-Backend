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
    logger.info('Creating harassment report', { userId, incidentType: dto.incidentType });

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
      });

      return {
        success: true,
        data: {
          id: data.id,
          referenceNumber: data.reference_number,
          status: data.status,
          immediateRisk: data.immediate_risk,
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

  async getUserReports(userId: string, page = 1, limit = 10) {
    logger.info('Fetching user harassment reports', { userId });

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.admin
        .from('harassment_reports')
        .select('*', { count: 'exact' })
        .eq('reporter_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new BadRequestException('Failed to fetch reports');
      }

      return {
        success: true,
        data: {
          reports: (data || []).map((report: any) => ({
            id: report.id,
            referenceNumber: report.reference_number,
            incidentType: report.incident_type,
            description: report.description,
            date: report.date,
            location: report.location,
            reporterType: report.reporter_type,
            immediateRisk: report.immediate_risk,
            status: report.status,
            createdAt: report.created_at,
            updatedAt: report.updated_at,
          })),
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
    logger.info('Fetching harassment report by reference', { userId, referenceNumber });

    try {
      const { data, error } = await this.admin
        .from('harassment_reports')
        .select('*')
        .eq('reporter_id', userId)
        .eq('reference_number', referenceNumber)
        .single();

      if (error || !data) {
        throw new NotFoundException('Report not found');
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
          status: data.status,
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
        .select('*')
        .eq('reporter_id', userId)
        .eq('id', reportId)
        .single();

      if (error || !data) {
        throw new NotFoundException('Report not found');
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
          status: data.status,
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
}
