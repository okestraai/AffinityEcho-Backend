import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { supabaseAdmin } from '../../database/supabase.client';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { ForumService } from '../forum/services/forum.service';
import {
  isReservedSpaceName,
  titleCaseWords,
} from '../../common/constants/onboarding-options';
import logger from '../../common/utils/logger.util';

// Members with the same typed company before admins are asked to give it its own space.
export const COMPANY_SUGGESTION_MIN_MEMBERS = 5;

export interface ResolvedCompany {
  // The name as it will be stored, for comparisons; not a database column.
  name: string;
  columns: {
    company_encrypted: string;
    company_type: 'static' | 'other';
    company_key: string | null;
  };
}

@Injectable()
export class CompaniesService {
  private admin;
  private readonly keySecret: string;

  constructor(
    config: ConfigService,
    private readonly encryption: EncryptionUtil,
    private readonly forums: ForumService,
  ) {
    this.admin = supabaseAdmin(config);
    this.keySecret = config.get<string>('ENCRYPTION_KEY') ?? '';
  }

  // Groups typed names that differ only in case, spacing or punctuation.
  companyKey(name: string): string {
    const normalized = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    return createHmac('sha256', this.keySecret)
      .update(`company:${normalized}`)
      .digest('hex');
  }

  async listActive(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.admin
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw new BadRequestException('Could not load companies');
    return data ?? [];
  }

  // The server decides whether a company is on the list; the app's claim is ignored.
  async resolve(name: string): Promise<ResolvedCompany> {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 2 || cleaned.length > 120) {
      throw new BadRequestException('Company name must be 2 to 120 characters');
    }
    if (isReservedSpaceName(cleaned)) {
      throw new BadRequestException(
        `"${cleaned}" can't be used as a company name`,
      );
    }
    const listed = await this.findListed(cleaned);
    if (listed) {
      return {
        name: listed.name,
        columns: {
          company_encrypted: this.encryption.encrypt(listed.name),
          company_type: 'static',
          company_key: null,
        },
      };
    }
    const typed = titleCaseWords(cleaned);
    return {
      name: typed,
      columns: {
        company_encrypted: this.encryption.encrypt(typed),
        company_type: 'other',
        company_key: this.companyKey(typed),
      },
    };
  }

  private async findListed(name: string) {
    const { data } = await this.admin
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .ilike(
        'name',
        name.replace(/[\\%_]/g, (c) => `\\${c}`),
      );
    return (data ?? [])[0] as { id: string; name: string } | undefined;
  }

  async listForAdmin() {
    const { data, error } = await this.admin
      .from('companies')
      .select('id, name, is_active, created_at, updated_at')
      .order('name', { ascending: true });
    if (error) throw new BadRequestException('Could not load companies');
    return data ?? [];
  }

  // Adds a company, creates its starter forums and moves members who typed it into its space.
  async addCompany(name: string, adminId: string) {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 2 || cleaned.length > 120) {
      throw new BadRequestException('Company name must be 2 to 120 characters');
    }
    if (isReservedSpaceName(cleaned)) {
      throw new BadRequestException(
        `"${cleaned}" can't be used as a company name`,
      );
    }
    if (await this.findAnyByName(cleaned)) {
      throw new ConflictException('That company is already on the list');
    }
    const { data: company, error } = await this.admin
      .from('companies')
      .insert({ name: cleaned, created_by: adminId })
      .select('id, name, is_active, created_at, updated_at')
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('That company is already on the list');
      }
      throw new BadRequestException('Could not add the company');
    }
    await this.forums.bootstrapFoundationForums(company.name);
    const membersMoved = await this.moveTypedMembers(company.name);
    return { company, membersMoved };
  }

  async setActive(id: string, isActive: boolean) {
    const { data, error } = await this.admin
      .from('companies')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, is_active, created_at, updated_at')
      .maybeSingle();
    if (error) throw new BadRequestException('Could not update the company');
    if (!data) throw new NotFoundException('Company not found');
    return data;
  }

  // Typed companies shared by enough members to deserve their own space.
  async suggestions() {
    const { data, error } = await this.admin
      .from('user_profiles')
      .select('company_key, company_encrypted')
      .eq('company_type', 'other')
      .not('company_key', 'is', null);
    if (error) throw new BadRequestException('Could not load suggestions');
    const groups = new Map<string, { members: number; sample: string }>();
    for (const row of data ?? []) {
      const group = groups.get(row.company_key);
      if (group) group.members += 1;
      else
        groups.set(row.company_key, {
          members: 1,
          sample: row.company_encrypted,
        });
    }
    return [...groups.values()]
      .filter((g) => g.members >= COMPANY_SUGGESTION_MIN_MEMBERS)
      .map((g) => ({ name: this.safeDecrypt(g.sample), members: g.members }))
      .filter((g) => g.name)
      .sort((a, b) => b.members - a.members);
  }

  private async findAnyByName(name: string) {
    const { data } = await this.admin
      .from('companies')
      .select('id')
      .ilike(
        'name',
        name.replace(/[\\%_]/g, (c) => `\\${c}`),
      );
    return (data ?? [])[0];
  }

  private async moveTypedMembers(name: string): Promise<number> {
    const { data } = await this.admin
      .from('user_profiles')
      .select('id')
      .eq('company_type', 'other')
      .eq('company_key', this.companyKey(name));
    let moved = 0;
    for (const row of data ?? []) {
      const { error } = await this.admin
        .from('user_profiles')
        .update({
          company_encrypted: this.encryption.encrypt(name),
          company_type: 'static',
          company_key: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error)
        logger.warn('Could not move a member to a new company space', {
          userId: row.id,
        });
      else moved += 1;
    }
    return moved;
  }

  private safeDecrypt(value: string): string | null {
    try {
      return this.encryption.decrypt(value);
    } catch {
      return null;
    }
  }
}
