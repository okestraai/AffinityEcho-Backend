import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../database/supabase.client';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import logger from '../../common/utils/logger.util';
import {
  Audience,
  OTHERS_SPACE,
  STAFF_ROLES,
  STUDENTS_SPACE,
} from './spaces.constants';

export interface UserSpaces {
  // The current company space, or null when the member has no company.
  company: string | null;
  // Every space the member belongs to: current company, past companies and Students.
  spaces: string[];
  isStudent: boolean;
  isStaff: boolean;
}

// Anything that lives in a space: a forum, topic, nook or feed post.
export interface SpaceItem {
  company_name?: string | null;
  is_global?: boolean | null;
  is_shared?: boolean | null;
  scope?: string | null;
}

@Injectable()
export class SpacesService {
  private admin;
  readonly enforce: boolean;

  constructor(
    config: ConfigService,
    private readonly encryption: EncryptionUtil,
  ) {
    this.admin = supabaseAdmin(config);
    this.enforce = config.get<string>('SHELL_ACCESS_ENFORCE') === 'true';
  }

  // The server's own view of a member's spaces; the space an app sends is never trusted.
  async forUser(userId: string): Promise<UserSpaces> {
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select(
        'role, company_encrypted, company_type, company_alumni_encrypted, is_student',
      )
      .eq('id', userId)
      .maybeSingle();
    const none: UserSpaces = {
      company: null,
      spaces: [],
      isStudent: false,
      isStaff: false,
    };
    if (!profile) return none;

    const isStaff = STAFF_ROLES.includes(profile.role);
    const isStudent = profile.is_student === true;
    // A typed company has no space of its own, so its members use Others.
    const company =
      profile.company_type === 'other' && profile.company_encrypted
        ? OTHERS_SPACE
        : this.decrypt(profile.company_encrypted);

    const spaces: string[] = [];
    if (company) spaces.push(company);
    if (Array.isArray(profile.company_alumni_encrypted)) {
      for (const value of profile.company_alumni_encrypted) {
        const name = this.decrypt(value);
        if (name) spaces.push(name);
      }
    }
    if (isStudent) spaces.push(STUDENTS_SPACE);

    return {
      company,
      spaces: unique(spaces),
      isStudent,
      isStaff,
    };
  }

  // Global, Shared and global-scope items are open to every member.
  canSee(user: UserSpaces, item: SpaceItem): boolean {
    if (user.isStaff) return true;
    if (item.is_shared || item.is_global) return true;
    if (!item.company_name) return item.scope !== 'local';
    return this.inSpace(user, item.company_name);
  }

  inSpace(user: UserSpaces, spaceName: string): boolean {
    if (user.isStaff) return true;
    const wanted = spaceName.trim().toLowerCase();
    return user.spaces.some((s) => s.toLowerCase() === wanted);
  }

  // Refuses an item outside the member's spaces. Until enforcement is on it only logs.
  assertCanSee(
    user: UserSpaces,
    userId: string,
    item: SpaceItem,
    action: string,
  ): void {
    if (this.canSee(user, item)) return;
    this.refuse(userId, item.company_name ?? null, action);
  }

  assertInSpace(
    user: UserSpaces,
    userId: string,
    spaceName: string,
    action: string,
  ): void {
    if (this.inSpace(user, spaceName)) return;
    this.refuse(userId, spaceName, action);
  }

  // The space a new post goes to, from the audience the member picked.
  audienceSpace(user: UserSpaces, audience: Audience): string | null {
    if (audience === 'everyone') return null;
    if (audience === 'students') {
      if (!user.isStudent)
        throw new ForbiddenException('Only students can post to Students');
      return STUDENTS_SPACE;
    }
    if (!user.company)
      throw new BadRequestException(
        'Add your company to your profile to post to your company',
      );
    return user.company;
  }

  // Loads a forum a member is acting on. Hidden and deleted forums don't exist for members.
  async forumFor(userId: string, forumId: string, action: string) {
    const { data: forum } = await this.admin
      .from('forums')
      .select(
        'id, name, is_global, is_shared, is_other_topics, company_name, is_hidden, is_locked, deleted_at, topic_count',
      )
      .eq('id', forumId)
      .maybeSingle();
    const user = await this.forUser(userId);
    if (!forum || (!user.isStaff && (forum.is_hidden || forum.deleted_at)))
      throw new NotFoundException('Forum not found');
    this.assertCanSee(user, userId, forum, action);
    return { forum, user };
  }

  // Checks a member may see a topic, from the topic's own space.
  async assertTopic(userId: string, topicId: string, action: string) {
    const { data: topic } = await this.admin
      .from('forum_topics')
      .select('id, company_name, scope')
      .eq('id', topicId)
      .maybeSingle();
    if (!topic) return;
    const user = await this.forUser(userId);
    this.assertCanSee(user, userId, topic, action);
  }

  // Checks a member may see a nook, from its own space.
  async assertNook(userId: string, nookId: string, action: string) {
    const { data: nook } = await this.admin
      .from('nooks')
      .select('id, scope, company_name')
      .eq('id', nookId)
      .maybeSingle();
    if (!nook) return;
    const user = await this.forUser(userId);
    this.assertCanSee(user, userId, nook, action);
  }

  // Forums members can't see; their topics are left out of every list.
  async closedForumIds(): Promise<string[]> {
    const { data } = await this.admin
      .from('forums')
      .select('id')
      .or('is_hidden.is.true,deleted_at.gt.1970-01-01');
    return (data ?? []).map((f: { id: string }) => f.id);
  }

  private refuse(userId: string, space: string | null, action: string) {
    logger.warn('Space access refused', {
      userId,
      space,
      action,
      enforced: this.enforce,
    });
    if (this.enforce) {
      throw new ForbiddenException("You don't have access to this space");
    }
  }

  private decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return this.encryption.decrypt(value) || null;
    } catch {
      return null;
    }
  }
}

function unique(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
