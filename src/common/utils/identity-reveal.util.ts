import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../database/supabase.client';
import { EncryptionUtil } from './encryption.util';

@Injectable()
export class IdentityRevealUtil {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Given a current user and a list of other user IDs, returns the set of user IDs
   * that have an accepted identity reveal with the current user.
   */
  async getRevealedUserIds(
    currentUserId: string,
    otherUserIds: string[],
  ): Promise<Set<string>> {
    if (otherUserIds.length === 0) return new Set();

    const uniqueIds = [...new Set(otherUserIds)];

    // Use two separate queries to avoid the PostgREST bug where
    // in.() inside nested and() inside or() passes "(uuid)" with
    // parentheses to PostgreSQL, causing a UUID parse error.
    const [q1, q2] = await Promise.all([
      this.admin
        .from('identity_reveals')
        .select('responder_id')
        .eq('status', 'accepted')
        .eq('requester_id', currentUserId)
        .in('responder_id', uniqueIds),
      this.admin
        .from('identity_reveals')
        .select('requester_id')
        .eq('status', 'accepted')
        .eq('responder_id', currentUserId)
        .in('requester_id', uniqueIds),
    ]);

    const revealedIds = new Set<string>();
    (q1.data || []).forEach((r: any) => revealedIds.add(r.responder_id));
    (q2.data || []).forEach((r: any) => revealedIds.add(r.requester_id));

    return revealedIds;
  }

  /**
   * Decrypt first_name + last_name into a real name string.
   * Returns null if decryption fails or names are empty.
   */
  decryptRealName(
    firstNameEncrypted: string | null | undefined,
    lastNameEncrypted: string | null | undefined,
  ): string | null {
    try {
      const firstName = firstNameEncrypted
        ? this.encryption.decrypt(firstNameEncrypted)
        : '';
      const lastName = lastNameEncrypted
        ? this.encryption.decrypt(lastNameEncrypted)
        : '';
      const realName = `${firstName} ${lastName}`.trim();
      return realName || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a specific user pair has an accepted identity reveal.
   */
  async isRevealed(userIdA: string, userIdB: string): Promise<boolean> {
    const { data } = await this.admin
      .from('identity_reveals')
      .select('id')
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${userIdA},responder_id.eq.${userIdB}),and(requester_id.eq.${userIdB},responder_id.eq.${userIdA})`,
      )
      .maybeSingle();

    return !!data;
  }
}
