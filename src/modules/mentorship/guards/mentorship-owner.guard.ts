import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';

interface DatabaseRecord {
  [key: string]: any;
  requester_id?: string;
  mentor_id?: string;
  mentee_id?: string;
}

@Injectable()
export class MentorshipOwnerGuard implements CanActivate {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const requestId =
      request.params.id ||
      request.params.requestId ||
      request.params.relationshipId ||
      request.params.sessionId;

    if (!user || !requestId) {
      throw new ForbiddenException('Access denied');
    }

    // Check if user is admin
    const { data: userProfile } = await this.admin
      .from('user_profiles')
      .select('id, badges')
      .eq('id', user.userId)
      .single();

    const isAdmin = userProfile?.badges?.includes('admin') || false;

    // Determine which table to check based on the parameter name
    let tableName = 'mentorship_requests';
    let userIdField = 'requester_id';

    if (request.params.relationshipId) {
      tableName = 'mentorship_relationships';
      userIdField = 'mentor_id';
    } else if (request.params.sessionId) {
      tableName = 'mentorship_sessions';
      // Need to check through relationship
      const { data: session } = await this.admin
        .from('mentorship_sessions')
        .select('relationship_id')
        .eq('id', requestId)
        .single();

      if (session) {
        const { data: relationship } = await this.admin
          .from('mentorship_relationships')
          .select('mentor_id, mentee_id')
          .eq('id', session.relationship_id)
          .single();

        if (
          relationship &&
          (relationship.mentor_id === user.userId ||
            relationship.mentee_id === user.userId)
        ) {
          return true;
        }
      }
      return false;
    }

    // Check ownership
    const { data: record } = await this.admin
      .from(tableName)
      .select(userIdField)
      .eq('id', requestId)
      .single();

    if (!record) {
      throw new ForbiddenException('Resource not found');
    }

    // Type-safe access using the DatabaseRecord interface
    const dbRecord = record as DatabaseRecord;
    const recordUserId = dbRecord[userIdField];

    // Allow if user is owner or admin
    if (recordUserId === user.userId || isAdmin) {
      return true;
    }

    // For relationships, also check if user is mentee
    if (tableName === 'mentorship_relationships') {
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentee_id')
        .eq('id', requestId)
        .single();

      if (relationship && relationship.mentee_id === user.userId) {
        return true;
      }
    }

    throw new ForbiddenException(
      'You do not have permission to access this resource',
    );
  }
}
