import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';

@Injectable()
export class MentorRelationshipGuard implements CanActivate {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const relationshipId = request.params.relationshipId;

    if (!user || !relationshipId) {
      throw new ForbiddenException('Access denied');
    }

    // Check if user is part of the relationship
    const { data: relationship } = await this.admin
      .from('mentorship_relationships')
      .select('mentor_id, mentee_id, status')
      .eq('id', relationshipId)
      .single();

    if (!relationship) {
      throw new ForbiddenException('Relationship not found');
    }

    // Check if user is mentor or mentee in the relationship
    if (
      relationship.mentor_id === user.userId ||
      relationship.mentee_id === user.userId
    ) {
      // Check if relationship is active or pending (for certain operations)
      if (['pending', 'accepted', 'active'].includes(relationship.status)) {
        return true;
      }
      throw new ForbiddenException('Relationship is not active');
    }

    throw new ForbiddenException('You are not part of this relationship');
  }
}
