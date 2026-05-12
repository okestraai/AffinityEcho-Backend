import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { AdminModerationQueryDto } from '../dto/admin-moderation-query.dto';
import { buildMeta, parsePagination } from '../admin.helpers';
import { AdminUsersService } from './admin-users.service';
import PDFDocument from 'pdfkit';

// Maps API type names to their source tables, content column, author column, and hidden-column support
const CONTENT_CONFIG: Record<
  string,
  {
    table: string;
    contentCol: string;
    authorCol: string;
    hasHiddenCols: boolean;
  }
> = {
  feed_post: {
    table: 'feed_posts',
    contentCol: 'content',
    authorCol: 'user_id',
    hasHiddenCols: true,
  },
  feed_comment: {
    table: 'feed_comments',
    contentCol: 'content',
    authorCol: 'user_id',
    hasHiddenCols: true,
  },
  forum_topic: {
    table: 'forum_topics',
    contentCol: 'content',
    authorCol: 'user_id',
    hasHiddenCols: true,
  },
  forum_comment: {
    table: 'forum_comments',
    contentCol: 'content',
    authorCol: 'user_id',
    hasHiddenCols: true,
  },
  nook: {
    table: 'nooks',
    contentCol: 'description',
    authorCol: 'creator_id',
    hasHiddenCols: true,
  },
  nook_message: {
    table: 'nook_messages',
    contentCol: 'content',
    authorCol: 'user_id',
    hasHiddenCols: true,
  },
  referral_post: {
    table: 'referral_posts',
    contentCol: 'description_encrypted',
    authorCol: 'user_id',
    hasHiddenCols: true,
  },
  referral_comment: {
    table: 'referral_comments',
    contentCol: 'content',
    authorCol: 'user_id',
    hasHiddenCols: true,
  },
};

@Injectable()
export class AdminModerationService {
  private admin;

  constructor(
    private config: ConfigService,
    private adminUsers: AdminUsersService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async listContent(query: AdminModerationQueryDto) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit);
    const contentType = query.type;

    // Get all content types to moderate
    const contentTypes = contentType
      ? [contentType]
      : [
          'feed_post',
          'feed_comment',
          'forum_topic',
          'forum_comment',
          'nook',
          'nook_message',
        ];

    // Fetch all content items from their source tables
    const allContent: any[] = [];

    for (const type of contentTypes) {
      const cfg = CONTENT_CONFIG[type];
      if (!cfg) continue;

      const hiddenCols = cfg.hasHiddenCols
        ? ', is_hidden, hidden_by, hidden_at, hidden_reason'
        : '';
      const selectFields = `id, ${cfg.contentCol}, ${cfg.authorCol}, created_at, updated_at${hiddenCols}`;

      let sourceQuery = this.admin
        .from(cfg.table)
        .select(selectFields)
        .order('created_at', { ascending: false });

      // Apply status filter (only for tables that have is_hidden column)
      if (cfg.hasHiddenCols) {
        if (query.status === 'hidden') {
          sourceQuery = sourceQuery.eq('is_hidden', true);
        } else if (query.status === 'visible') {
          sourceQuery = sourceQuery.eq('is_hidden', false);
        }
      }

      const { data: sourceData, error: sourceError } = await sourceQuery;

      // Skip if error or no data
      if (sourceError || !sourceData || sourceData.length === 0) continue;

      // Collect all content IDs for batch fetching
      const contentIds = sourceData.map((item: any) => item.id);
      const userIds = new Set(
        sourceData
          .map((item: any) => item[cfg.authorCol])
          .filter((id: any) => id),
      );
      const moderatorIds = new Set(
        sourceData.map((item: any) => item.hidden_by).filter((id: any) => id),
      );

      // Batch fetch moderation records (Supabase has limit, so we chunk if needed)
      const chunkSize = 1000;
      const moderationData: any[] = [];

      for (let i = 0; i < contentIds.length; i += chunkSize) {
        const chunk = contentIds.slice(i, i + chunkSize);
        const { data } = await this.admin
          .from('content_moderation')
          .select(
            'id, content_id, moderation_status, moderation_reason, reports_count, moderated_by, moderated_at',
          )
          .eq('content_type', type)
          .in('content_id', chunk);

        if (data) moderationData.push(...data);
      }

      // Create a map for quick lookup
      const moderationMap = new Map();
      moderationData.forEach((cm: any) => {
        moderationMap.set(cm.content_id, cm);
        if (cm.moderated_by) moderatorIds.add(cm.moderated_by);
      });

      // Batch fetch all users (authors + moderators) in chunks
      const allUserIds = Array.from(new Set([...userIds, ...moderatorIds]));
      const usersData: any[] = [];

      for (let i = 0; i < allUserIds.length; i += chunkSize) {
        const chunk = allUserIds.slice(i, i + chunkSize);
        if (chunk.length > 0) {
          const { data } = await this.admin
            .from('user_profiles')
            .select('id, username, avatar, is_company_verified')
            .in('id', chunk);

          if (data) usersData.push(...data);
        }
      }

      // Create user map for quick lookup
      const userMap = new Map();
      usersData.forEach((user: any) => {
        userMap.set(user.id, user);
      });

      // Now process all items with cached data
      for (const item of sourceData) {
        const cmData = moderationMap.get(item.id);

        // Determine moderation status
        let moderationStatus = 'visible';
        let reportsCount = 0;

        if (cmData) {
          moderationStatus = cmData.moderation_status;
          reportsCount = cmData.reports_count || 0;
        } else if (item.is_hidden) {
          moderationStatus = 'hidden';
        }

        // Apply flagged filter
        if (query.flagged === 'true' && reportsCount === 0) {
          continue;
        }

        // Get author from map
        const authorId = item[cfg.authorCol];
        const author = authorId ? userMap.get(authorId) || null : null;

        // Get moderator from map
        const moderatorId = item.hidden_by || cmData?.moderated_by;
        const moderatedBy = moderatorId
          ? userMap.get(moderatorId) || null
          : null;

        const contentValue = item[cfg.contentCol];

        allContent.push({
          id: cmData?.id || randomUUID(),
          type: type,
          content_id: item.id,
          author,
          preview: contentValue ? String(contentValue).slice(0, 200) : null,
          full_content: contentValue,
          moderation_status: moderationStatus,
          moderation_reason: item.hidden_reason || cmData?.moderation_reason,
          reports_count: reportsCount,
          created_at: item.created_at,
          updated_at: item.updated_at,
          moderated_at: item.hidden_at || cmData?.moderated_at,
          moderated_by: moderatedBy,
          is_hidden: item.is_hidden,
        });
      }
    }

    // Sort by query params (default: created_at desc)
    const sortField = query.sortBy || 'created_at';
    const sortAsc = query.sortOrder === 'asc';
    allContent.sort((a, b) => {
      const aVal =
        sortField === 'reports_count'
          ? (a.reports_count ?? 0)
          : new Date(a[sortField] ?? 0).getTime();
      const bVal =
        sortField === 'reports_count'
          ? (b.reports_count ?? 0)
          : new Date(b[sortField] ?? 0).getTime();
      return sortAsc ? aVal - bVal : bVal - aVal;
    });

    // Calculate totals for summary
    const totalContent = allContent.length;
    const activeContent = allContent.filter((item) => !item.is_hidden).length;

    // Calculate summary counts
    const summary = {
      total: totalContent,
      active: activeContent,
      visible: allContent.filter((item) => item.moderation_status === 'visible')
        .length,
      hidden: allContent.filter((item) => item.moderation_status === 'hidden')
        .length,
      removed: allContent.filter((item) => item.moderation_status === 'removed')
        .length,
      flagged: allContent.filter((item) => item.reports_count > 0).length,
    };

    // Paginate results
    const paginatedItems = allContent.slice(offset, offset + pageSize);

    return {
      success: true,
      data: {
        summary,
        items: paginatedItems,
      },
      meta: buildMeta(page, pageSize, totalContent),
    };
  }
  async getContentDetail(contentType: string, contentId: string) {
    const cfg = CONTENT_CONFIG[contentType];
    if (!cfg)
      throw new BadRequestException(`Invalid content type: ${contentType}`);

    const hiddenCols = cfg.hasHiddenCols
      ? ', is_hidden, hidden_by, hidden_at, hidden_reason'
      : '';
    const selectFields = `id, ${cfg.contentCol}, ${cfg.authorCol}, created_at, updated_at${hiddenCols}`;

    // Get source content
    const { data: source, error: sourceError } = await this.admin
      .from(cfg.table)
      .select(selectFields)
      .eq('id', contentId)
      .maybeSingle();

    if (sourceError || !source)
      throw new NotFoundException('Content not found');

    // Get author
    let author: any = null;
    const sourceAuthorId = source[cfg.authorCol];
    if (sourceAuthorId) {
      const { data: userData } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar, email, is_company_verified')
        .eq('id', sourceAuthorId)
        .maybeSingle();
      author = userData;
    }

    // Get moderation record
    const { data: cmData } = await this.admin
      .from('content_moderation')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .maybeSingle();

    // Get moderator info
    let moderatedBy: any = null;
    const moderatorId = source.hidden_by || cmData?.moderated_by;
    if (moderatorId) {
      const { data: modData } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar, is_company_verified')
        .eq('id', moderatorId)
        .maybeSingle();
      moderatedBy = modData;
    }

    const contentValue = source[cfg.contentCol];

    return {
      success: true,
      data: {
        id: cmData?.id || randomUUID(),
        type: contentType,
        content_id: contentId,
        author,
        content: contentValue,
        moderation_status:
          cmData?.moderation_status ||
          (source.is_hidden ? 'hidden' : 'visible'),
        moderation_reason: source.hidden_reason || cmData?.moderation_reason,
        reports_count: cmData?.reports_count || 0,
        created_at: source.created_at,
        updated_at: source.updated_at,
        moderated_at: source.hidden_at || cmData?.moderated_at,
        moderated_by: moderatedBy,
        is_hidden: source.is_hidden,
      },
    };
  }

  async hideContent(
    adminId: string,
    adminUsername: string,
    contentType: string,
    contentId: string,
    reason: string,
    ip?: string,
  ) {
    if (!CONTENT_CONFIG[contentType])
      throw new BadRequestException(`Invalid content type: ${contentType}`);

    await this.upsertModeration(
      adminId,
      contentType,
      contentId,
      'hidden',
      reason,
    );
    await this.updateSourceHidden(
      contentType,
      contentId,
      true,
      adminId,
      reason,
    );
    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'hide_content',
      contentType,
      contentId,
      reason,
      {},
      ip,
    );

    return { success: true, data: null };
  }

  async restoreContent(
    adminId: string,
    adminUsername: string,
    contentType: string,
    contentId: string,
    reason: string,
    ip?: string,
  ) {
    if (!CONTENT_CONFIG[contentType])
      throw new BadRequestException(`Invalid content type: ${contentType}`);

    await this.upsertModeration(
      adminId,
      contentType,
      contentId,
      'visible',
      reason,
    );
    await this.updateSourceHidden(contentType, contentId, false, adminId, null);
    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'restore_content',
      contentType,
      contentId,
      reason,
      {},
      ip,
    );

    return { success: true, data: null };
  }

  async deleteContent(
    adminId: string,
    adminUsername: string,
    contentType: string,
    contentId: string,
    reason: string,
    ip?: string,
  ) {
    if (!CONTENT_CONFIG[contentType])
      throw new BadRequestException(`Invalid content type: ${contentType}`);

    await this.upsertModeration(
      adminId,
      contentType,
      contentId,
      'removed',
      reason,
    );

    // Soft-delete from source table
    const cfg = CONTENT_CONFIG[contentType];
    if (cfg) {
      await this.admin
        .from(cfg.table)
        .update({
          is_hidden: true,
          hidden_by: adminId,
          hidden_at: new Date().toISOString(),
          hidden_reason: reason,
        })
        .eq('id', contentId);
    }

    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'remove_content',
      contentType,
      contentId,
      reason,
      {},
      ip,
    );
    return null; // 204
  }

  async pinTopic(
    adminId: string,
    adminUsername: string,
    topicId: string,
    isPinned: boolean,
    ip?: string,
  ) {
    const { error } = await this.admin
      .from('forum_topics')
      .update({ is_pinned: isPinned })
      .eq('id', topicId);

    if (error) throw new BadRequestException(error.message);

    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      isPinned ? 'pin_topic' : 'unpin_topic',
      'forum_topic',
      topicId,
      undefined,
      {},
      ip,
    );

    return { success: true, data: { id: topicId, is_pinned: isPinned } };
  }

  async lockTopic(
    adminId: string,
    adminUsername: string,
    topicId: string,
    isLocked: boolean,
    ip?: string,
  ) {
    const { error } = await this.admin
      .from('forum_topics')
      .update({ is_locked: isLocked })
      .eq('id', topicId);

    if (error) throw new BadRequestException(error.message);

    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      isLocked ? 'lock_topic' : 'unlock_topic',
      'forum_topic',
      topicId,
      undefined,
      {},
      ip,
    );

    return { success: true, data: { id: topicId, is_locked: isLocked } };
  }

  private async upsertModeration(
    adminId: string,
    contentType: string,
    contentId: string,
    status: string,
    reason: string,
  ) {
    const now = new Date().toISOString();

    // First check if record exists
    const { data: existing } = await this.admin
      .from('content_moderation')
      .select('id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error } = await this.admin
        .from('content_moderation')
        .update({
          moderation_status: status,
          moderation_reason: reason,
          moderated_by: adminId,
          moderated_at: now,
          updated_at: now,
        })
        .eq('content_type', contentType)
        .eq('content_id', contentId);

      if (error) throw new BadRequestException(error.message);
    } else {
      // Insert new
      const { error } = await this.admin.from('content_moderation').insert({
        id: randomUUID(),
        content_type: contentType,
        content_id: contentId,
        moderation_status: status,
        moderation_reason: reason,
        moderated_by: adminId,
        moderated_at: now,
        created_at: now,
        updated_at: now,
      });

      if (error) throw new BadRequestException(error.message);
    }
  }

  private async updateSourceHidden(
    contentType: string,
    contentId: string,
    isHidden: boolean,
    adminId: string,
    reason: string | null,
  ) {
    const cfg = CONTENT_CONFIG[contentType];
    if (!cfg) return;

    const update: Record<string, any> = { is_hidden: isHidden };

    if (isHidden) {
      update.hidden_by = adminId;
      update.hidden_at = new Date().toISOString();
      if (reason) update.hidden_reason = reason;
    } else {
      update.hidden_by = null;
      update.hidden_at = null;
      update.hidden_reason = null;
    }

    await this.admin.from(cfg.table).update(update).eq('id', contentId);
  }

  /**
   * Export content to CSV or PDF
   */
  async exportContent(
    query: AdminModerationQueryDto,
    format: 'csv' | 'pdf',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const contentType = query.type;
    const sortBy = query.sortBy ?? 'created_at';
    const ascending = query.sortOrder === 'asc';

    // Get all content types to moderate
    const contentTypes = contentType
      ? [contentType]
      : [
          'feed_post',
          'feed_comment',
          'forum_topic',
          'forum_comment',
          'nook',
          'nook_message',
        ];

    // Fetch all content items (no pagination for export)
    const allContent: any[] = [];

    for (const type of contentTypes) {
      const cfg = CONTENT_CONFIG[type];
      if (!cfg) continue;

      const hiddenCols = cfg.hasHiddenCols
        ? ', is_hidden, hidden_by, hidden_at, hidden_reason'
        : '';
      const selectFields = `id, ${cfg.contentCol}, ${cfg.authorCol}, created_at, updated_at${hiddenCols}`;

      let sourceQuery = this.admin
        .from(cfg.table)
        .select(selectFields)
        .order('created_at', { ascending: false });

      // Apply status filter (only for tables that have is_hidden column)
      if (cfg.hasHiddenCols) {
        if (query.status === 'hidden') {
          sourceQuery = sourceQuery.eq('is_hidden', true);
        } else if (query.status === 'visible') {
          sourceQuery = sourceQuery.eq('is_hidden', false);
        }
      }

      const { data: sourceData, error: sourceError } = await sourceQuery;

      if (sourceError || !sourceData || sourceData.length === 0) continue;

      // Collect IDs for batch fetching
      const contentIds = sourceData.map((item: any) => item.id);
      const userIds = new Set(
        sourceData
          .map((item: any) => item[cfg.authorCol])
          .filter((id: any) => id),
      );
      const moderatorIds = new Set(
        sourceData.map((item: any) => item.hidden_by).filter((id: any) => id),
      );

      // Batch fetch moderation records
      const chunkSize = 1000;
      const moderationData: any[] = [];

      for (let i = 0; i < contentIds.length; i += chunkSize) {
        const chunk = contentIds.slice(i, i + chunkSize);
        const { data } = await this.admin
          .from('content_moderation')
          .select(
            'id, content_id, moderation_status, moderation_reason, reports_count, moderated_by, moderated_at',
          )
          .eq('content_type', type)
          .in('content_id', chunk);

        if (data) moderationData.push(...data);
      }

      const moderationMap = new Map();
      moderationData.forEach((cm: any) => {
        moderationMap.set(cm.content_id, cm);
        if (cm.moderated_by) moderatorIds.add(cm.moderated_by);
      });

      // Batch fetch users
      const allUserIds = Array.from(new Set([...userIds, ...moderatorIds]));
      const usersData: any[] = [];

      for (let i = 0; i < allUserIds.length; i += chunkSize) {
        const chunk = allUserIds.slice(i, i + chunkSize);
        if (chunk.length > 0) {
          const { data } = await this.admin
            .from('user_profiles')
            .select('id, username, email, avatar, is_company_verified')
            .in('id', chunk);

          if (data) usersData.push(...data);
        }
      }

      const userMap = new Map();
      usersData.forEach((user: any) => {
        userMap.set(user.id, user);
      });

      // Process all items
      for (const item of sourceData) {
        const cmData = moderationMap.get(item.id);

        let moderationStatus = 'visible';
        let reportsCount = 0;

        if (cmData) {
          moderationStatus = cmData.moderation_status;
          reportsCount = cmData.reports_count || 0;
        } else if (item.is_hidden) {
          moderationStatus = 'hidden';
        }

        // Apply flagged filter
        if (query.flagged === 'true' && reportsCount === 0) {
          continue;
        }

        const authorId = item[cfg.authorCol];
        const author = authorId ? userMap.get(authorId) || null : null;

        const moderatorId = item.hidden_by || cmData?.moderated_by;
        const moderatedBy = moderatorId
          ? userMap.get(moderatorId) || null
          : null;

        const contentValue = item[cfg.contentCol];

        allContent.push({
          id: cmData?.id || randomUUID(),
          type: type,
          content_id: item.id,
          author_name: author?.username || 'Unknown',
          author_email: author?.email || 'N/A',
          content_preview: contentValue
            ? String(contentValue).slice(0, 200)
            : null,
          full_content: contentValue,
          moderation_status: moderationStatus,
          moderation_reason: item.hidden_reason || cmData?.moderation_reason,
          reports_count: reportsCount,
          created_at: item.created_at,
          updated_at: item.updated_at,
          moderated_at: item.hidden_at || cmData?.moderated_at,
          moderated_by_name: moderatedBy?.username || 'N/A',
          is_hidden: item.is_hidden,
        });
      }
    }

    // Sort content
    allContent.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';

      if (ascending) {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    if (format === 'csv') {
      return this.generateContentCSV(allContent, query);
    } else {
      return this.generateContentPDF(allContent, query);
    }
  }

  /**
   * Generate CSV export for content
   */
  private generateContentCSV(
    content: any[],
    query: AdminModerationQueryDto,
  ): { buffer: Buffer; filename: string; contentType: string } {
    const headers = [
      'Content ID',
      'Type',
      'Author',
      'Author Email',
      'Status',
      'Reports Count',
      'Preview',
      'Moderated By',
      'Moderated At',
      'Moderation Reason',
      'Created At',
      'Updated At',
    ];

    const rows = content.map((c) => [
      c.content_id,
      c.type,
      c.author_name,
      c.author_email,
      c.moderation_status,
      c.reports_count || 0,
      this.escapeCSV(c.content_preview || ''),
      c.moderated_by_name,
      c.moderated_at || '',
      this.escapeCSV(c.moderation_reason || ''),
      c.created_at,
      c.updated_at,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const timestamp = new Date().toISOString().split('T')[0];
    const filters = this.buildContentFilterString(query);
    const filename = `content-moderation${filters}-${timestamp}.csv`;

    return {
      buffer: Buffer.from('\uFEFF' + csvContent, 'utf-8'),
      filename,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  /**
   * Generate PDF export for content using PDFKit
   */
  private async generateContentPDF(
    content: any[],
    query: AdminModerationQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const filters = this.buildContentFilterString(query);
    const date = new Date().toISOString().split('T')[0];

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 40,
        info: {
          Title: 'Content Moderation Export',
          Author: 'AffinityEcho Admin Portal',
          Subject: 'Content Moderation Data Export',
          CreationDate: new Date(),
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const margin = 40;

      // Header background
      doc.rect(0, 0, pageWidth, 70).fill('#7c3aed');

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#ffffff')
        .text('Content Moderation Export', margin, 20);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#ede9fe')
        .text('CONFIDENTIAL — AUTHORIZED PERSONNEL ONLY', margin, 44);

      const metadataX = pageWidth - margin - 200;
      doc
        .fontSize(9)
        .fillColor('#ede9fe')
        .text(
          `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
          metadataX,
          20,
          { width: 200, align: 'right' },
        )
        .text(`Total: ${content.length} items`, metadataX, 34, {
          width: 200,
          align: 'right',
        });

      let y = 90;

      // Summary box
      const visible = content.filter(
        (c) => c.moderation_status === 'visible',
      ).length;
      const hidden = content.filter(
        (c) => c.moderation_status === 'hidden',
      ).length;
      const removed = content.filter(
        (c) => c.moderation_status === 'removed',
      ).length;
      const flagged = content.filter((c) => c.reports_count > 0).length;

      const summaryBoxHeight = 55;
      doc
        .rect(margin, y, pageWidth - 2 * margin, summaryBoxHeight)
        .fill('#f5f3ff');
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#5b21b6')
        .text('STATUS DISTRIBUTION', margin + 10, y + 8);

      const statW = (pageWidth - 2 * margin - 20) / 4;
      const stats = [
        { label: 'VISIBLE', value: visible, color: '#16a34a' },
        { label: 'HIDDEN', value: hidden, color: '#dc2626' },
        { label: 'REMOVED', value: removed, color: '#6b7280' },
        { label: 'FLAGGED', value: flagged, color: '#ea580c' },
      ];

      stats.forEach((stat, i) => {
        const sx = margin + 10 + i * statW;
        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .fillColor(stat.color)
          .text(String(stat.value), sx, y + 20, { width: statW - 5 });
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#6b7280')
          .text(stat.label, sx, y + 40, { width: statW - 5 });
      });

      y += summaryBoxHeight + 15;

      // Table columns
      const cols = [
        { label: 'Type', width: 90 },
        { label: 'Author', width: 110 },
        { label: 'Status', width: 75 },
        { label: 'Reports', width: 55 },
        { label: 'Preview', width: pageWidth - 2 * margin - 430 },
        { label: 'Moderated By', width: 100 },
      ];

      // Table header
      doc.rect(margin, y, pageWidth - 2 * margin, 18).fill('#4c1d95');
      let x = margin;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
      cols.forEach((col) => {
        doc.text(col.label, x + 4, y + 5, { width: col.width - 8 });
        x += col.width;
      });
      y += 18;

      const statusColors: Record<string, string> = {
        visible: '#065f46',
        hidden: '#991b1b',
        removed: '#374151',
      };

      content.forEach((c, idx) => {
        const rowHeight = 22;

        if (y + rowHeight > doc.page.height - 50) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
          y = 40;
          doc.rect(margin, y, pageWidth - 2 * margin, 18).fill('#4c1d95');
          let hx = margin;
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
          cols.forEach((col) => {
            doc.text(col.label, hx + 4, y + 5, { width: col.width - 8 });
            hx += col.width;
          });
          y += 18;
        }

        doc
          .rect(margin, y, pageWidth - 2 * margin, rowHeight)
          .fill(idx % 2 === 0 ? '#ffffff' : '#faf5ff');

        let cx = margin;
        doc.fontSize(7).font('Helvetica').fillColor('#1f2937');

        doc.text((c.type || '-').replace(/_/g, ' '), cx + 4, y + 7, {
          width: cols[0].width - 8,
        });
        cx += cols[0].width;

        doc.text(c.author_name || 'Unknown', cx + 4, y + 7, {
          width: cols[1].width - 8,
        });
        cx += cols[1].width;

        doc
          .fillColor(statusColors[c.moderation_status] || '#374151')
          .font('Helvetica-Bold')
          .text((c.moderation_status || '-').toUpperCase(), cx + 4, y + 7, {
            width: cols[2].width - 8,
          });
        cx += cols[2].width;

        doc
          .fillColor(c.reports_count > 0 ? '#ea580c' : '#374151')
          .font('Helvetica-Bold')
          .text(String(c.reports_count || 0), cx + 4, y + 7, {
            width: cols[3].width - 8,
          });
        cx += cols[3].width;

        const preview = (c.content_preview || '').substring(0, 80);
        doc
          .fillColor('#1f2937')
          .font('Helvetica')
          .text(preview, cx + 4, y + 7, { width: cols[4].width - 8 });
        cx += cols[4].width;

        doc.text(c.moderated_by_name || 'N/A', cx + 4, y + 7, {
          width: cols[5].width - 8,
        });

        y += rowHeight;
      });

      // Footer
      y += 10;
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#9ca3af')
        .text(
          'CONFIDENTIAL DOCUMENT — Subject to privacy laws and company policy.',
          margin,
          y,
          { width: pageWidth - 2 * margin, align: 'center' },
        );

      doc.end();
    });

    return {
      buffer,
      filename: `content-moderation${filters}-${date}.pdf`,
      contentType: 'application/pdf',
    };
  }

  /**
   * Escape CSV fields
   */
  private escapeCSV(str: string): string {
    if (!str) return '';
    return str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
  }

  /**
   * Build filter string for filename
   */
  private buildContentFilterString(query: AdminModerationQueryDto): string {
    const parts: string[] = [];
    if (query.type) parts.push(query.type);
    if (query.status) parts.push(query.status);
    if (query.flagged === 'true') parts.push('flagged');

    return parts.length > 0 ? `-${parts.join('-')}` : '';
  }
}
