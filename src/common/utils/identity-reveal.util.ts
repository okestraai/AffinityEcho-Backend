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

    const { data: reveals } = await this.admin
      .from('identity_reveals')
      .select('requester_id, responder_id')
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${currentUserId},responder_id.in.(${uniqueIds.join(',')})),and(responder_id.eq.${currentUserId},requester_id.in.(${uniqueIds.join(',')}))`,
      );

    const revealedIds = new Set<string>();
    (reveals || []).forEach((r: any) => {
      const otherId =
        r.requester_id === currentUserId ? r.responder_id : r.requester_id;
      revealedIds.add(otherId);
    });

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
