import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { supabaseAdmin } from '../../database/supabase.client';
import { getPool } from '../../database/pg-client';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import logger from '../../common/utils/logger.util';
import {
  Attendance,
  EVENTS_PER_DAY,
  EventMode,
  NOTIFIED_FIELDS,
} from './events.constants';
import {
  CheckInDto,
  CreateEventDto,
  RegisterDto,
  UpdateEventDto,
} from './dto/event.dto';
import { EventNoticesService } from './event-notices.service';

// Details that belong to one mode and are cleared when the event no longer uses it.
// Events no member sees: removed by a moderator or deleted by the host.
const HIDDEN_STATUSES = ['removed', 'deleted'];

const MODE_FIELDS = [
  'venue_name',
  'venue_address',
  'venue_city',
  'map_url',
  'capacity_in_person',
  'join_url',
  'capacity_online',
] as const;

const REQUIRED_FIELDS = [
  'title',
  'mode',
  'starts_at',
  'ends_at',
  'time_zone',
  'organiser_name',
] as const;

export interface Guest {
  registrationId: string;
  name: string;
  email: string | null;
  attendance: Attendance;
  checkedInAt: string | null;
  status: string;
  registeredAt: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Columns anyone may see. The address and join link are for guests and the host only.
const PUBLIC_COLUMNS =
  'id, slug, title, description, mode, starts_at, ends_at, time_zone, venue_name, venue_city, capacity_in_person, capacity_online, registration_closes_at, organiser_name, status, created_at';
const ALL_COLUMNS = `${PUBLIC_COLUMNS}, host_id, venue_address, map_url, join_url, cancelled_at, removed_reason`;

@Injectable()
export class EventsService {
  private admin;

  constructor(
    config: ConfigService,
    private readonly encryption: EncryptionUtil,
    private readonly notices: EventNoticesService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // ── Hosting ──────────────────────────────────────────────────

  async create(hostId: string, dto: CreateEventDto) {
    const { data: host } = await this.admin
      .from('user_profiles')
      .select(
        'has_completed_onboarding, event_policy_accepted_at, event_hosting_stopped_at',
      )
      .eq('id', hostId)
      .maybeSingle();
    if (!host?.has_completed_onboarding)
      throw new ForbiddenException(
        'Finish setting up your profile to host events',
      );
    if (host.event_hosting_stopped_at)
      throw new ForbiddenException(
        'Hosting has been turned off for your account',
      );
    if (!host.event_policy_accepted_at) {
      if (dto.acceptPolicy !== true)
        throw new BadRequestException({
          message: 'Accept the event policy to host your first event',
          code: 'EVENT_POLICY_REQUIRED',
        });
      await this.admin
        .from('user_profiles')
        .update({ event_policy_accepted_at: new Date().toISOString() })
        .eq('id', hostId);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await this.admin
      .from('events')
      .select('id', { count: 'exact' })
      .eq('host_id', hostId)
      .gte('created_at', since);
    if ((count ?? 0) >= EVENTS_PER_DAY)
      throw new BadRequestException(
        `You can create up to ${EVENTS_PER_DAY} events a day`,
      );

    const row = this.eventColumns(dto);
    this.checkShape(row);

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await this.admin
        .from('events')
        .insert({ ...row, host_id: hostId, slug: makeSlug(dto.title) })
        .select(ALL_COLUMNS)
        .single();
      if (!error) return this.hostView(data);
      if (error.code !== '23505') {
        logger.error('Event create failed', { error: error.message });
        throw new BadRequestException('Could not create the event');
      }
    }
    throw new ConflictException('Could not create the event. Try again.');
  }

  async update(hostId: string, eventId: string, dto: UpdateEventDto) {
    const current = await this.hostEvent(hostId, eventId);
    if (current.status !== 'published')
      throw new ConflictException('This event can no longer be changed');

    const changes = this.eventColumns(dto, true);
    const merged = { ...current, ...changes };
    this.checkShape(merged);
    // Details the new mode doesn't use are cleared in the database too, not only checked.
    for (const key of MODE_FIELDS) {
      if (merged[key] !== current[key]) changes[key] = merged[key];
    }

    const { data, error } = await this.admin
      .from('events')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .eq('status', 'published')
      .select(ALL_COLUMNS)
      .maybeSingle();
    if (error) throw new BadRequestException('Could not save the event');
    if (!data)
      throw new ConflictException('This event can no longer be changed');

    // Guests hear about changes that matter to them, grouped over a short window.
    const changed = NOTIFIED_FIELDS.filter(
      (f) =>
        f in changes && String(changes[f] ?? '') !== String(current[f] ?? ''),
    );
    if (changed.length) await this.notices.queueUpdate(eventId);
    return this.hostView(data);
  }

  async cancel(hostId: string, eventId: string) {
    await this.hostEvent(hostId, eventId);
    const now = new Date().toISOString();
    const { data } = await this.admin
      .from('events')
      .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
      .eq('id', eventId)
      .eq('status', 'published')
      .select('id');
    if (!data?.length)
      throw new ConflictException('This event is already cancelled');
    await this.notices.queueCancel(eventId);
    return { success: true };
  }

  // Deleting hides the event everywhere. Guests who were still coming are told it's off.
  async remove(hostId: string, eventId: string) {
    const event = await this.hostEvent(hostId, eventId);
    const now = new Date().toISOString();
    const { data } = await this.admin
      .from('events')
      .update({ status: 'deleted', deleted_at: now, updated_at: now })
      .eq('id', eventId)
      .not('status', 'in', HIDDEN_STATUSES)
      .select('id');
    if (!data?.length) throw new NotFoundException('Event not found');
    if (
      event.status === 'published' &&
      new Date(event.ends_at).getTime() > Date.now()
    ) {
      await this.notices.queueCancel(eventId);
    }
    return { success: true };
  }

  // A registered guest's code shows the details for how they're attending, without signing in.
  async revealWithCode(slug: string, code: string) {
    const event = await this.bySlug(slug, true);
    const { data: reg } = await this.admin
      .from('event_registrations')
      .select('id, attendance, status')
      .eq('event_id', event.id)
      .eq('check_in_code', code.trim().toUpperCase())
      .maybeSingle();
    if (!reg || reg.status !== 'registered')
      throw new NotFoundException('That code is not valid for this event');
    const inPerson = reg.attendance === 'in_person';
    return {
      attendance: reg.attendance,
      venueAddress: inPerson ? event.venue_address : null,
      mapUrl: inPerson ? event.map_url : null,
      joinUrl: inPerson ? null : event.join_url,
    };
  }

  // Link opens, registrations split by in person and online, and the guest list.
  async hostPage(hostId: string, eventId: string) {
    const event = await this.hostEvent(hostId, eventId);
    const [{ count: views }, guests]: [{ count: number | null }, Guest[]] =
      await Promise.all([
        this.admin
          .from('event_views')
          .select('id', { count: 'exact' })
          .eq('event_id', eventId),
        this.guestList(eventId),
      ]);
    const active = guests.filter((g) => g.status === 'registered');
    return {
      event: this.hostView(event),
      stats: {
        linkOpens: views ?? 0,
        registered: active.length,
        inPerson: active.filter((g) => g.attendance === 'in_person').length,
        online: active.filter((g) => g.attendance === 'online').length,
        checkedIn: active.filter((g) => g.checkedInAt).length,
      },
      guests,
    };
  }

  async checkIn(hostId: string, eventId: string, dto: CheckInDto) {
    await this.hostEvent(hostId, eventId);
    if (!dto.code && !dto.registrationId)
      throw new BadRequestException('Send a code or pick a guest');
    let query = this.admin
      .from('event_registrations')
      .select('id, name_encrypted, attendance, checked_in_at, status')
      .eq('event_id', eventId);
    query = dto.code
      ? query.eq('check_in_code', dto.code)
      : query.eq('id', dto.registrationId);
    const { data: reg } = await query.maybeSingle();
    if (!reg || reg.status !== 'registered')
      throw new NotFoundException('No guest with that code');
    if (!reg.checked_in_at) {
      await this.admin
        .from('event_registrations')
        .update({ checked_in_at: new Date().toISOString() })
        .eq('id', reg.id)
        .is('checked_in_at', null);
    }
    return {
      registrationId: reg.id,
      name: this.decrypt(reg.name_encrypted),
      attendance: reg.attendance,
      alreadyCheckedIn: !!reg.checked_in_at,
    };
  }

  // The guest list as CSV. Emails appear only for guests who chose to share them.
  async guestCsv(hostId: string, eventId: string): Promise<string> {
    await this.hostEvent(hostId, eventId);
    const guests = await this.guestList(eventId);
    const rows = [
      ['Name', 'Email', 'Attending', 'Checked in', 'Registered'],
      ...guests
        .filter((g) => g.status === 'registered')
        .map((g) => [
          g.name,
          g.email ?? '',
          g.attendance === 'in_person' ? 'In person' : 'Online',
          g.checkedInAt ? 'Yes' : 'No',
          new Date(g.registeredAt).toISOString(),
        ]),
    ];
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  // ── Guests ───────────────────────────────────────────────────

  // The public page: venue name and city, never the address or join link.
  async publicView(slug: string, viewerId?: string) {
    const event = await this.bySlug(slug);
    this.admin
      .from('event_views')
      .insert({ event_id: event.id, user_id: viewerId ?? null })
      .then(undefined, () => undefined);
    return this.publicShape(event, await this.counts(event.id));
  }

  // What a signed-in member sees: the full details if they are a guest or the host.
  async memberView(slug: string, userId: string) {
    const event = await this.bySlug(slug, true);
    const { data: reg } = await this.admin
      .from('event_registrations')
      .select(
        'id, attendance, share_email, check_in_code, checked_in_at, status',
      )
      .eq('event_id', event.id)
      .eq('user_id', userId)
      .maybeSingle();
    const isHost = event.host_id === userId;
    const isGuest = reg?.status === 'registered';
    const base = this.publicShape(event, await this.counts(event.id));
    return {
      ...base,
      isHost,
      registration: isGuest
        ? {
            id: reg.id,
            attendance: reg.attendance,
            shareEmail: reg.share_email,
            checkInCode: reg.check_in_code,
            checkedIn: !!reg.checked_in_at,
          }
        : null,
      details:
        isHost || isGuest
          ? {
              venueAddress: event.venue_address,
              mapUrl: event.map_url,
              joinUrl: event.join_url,
            }
          : null,
    };
  }

  async register(userId: string, slug: string, dto: RegisterDto) {
    const event = await this.bySlug(slug, true);
    if (event.status !== 'published')
      throw new ConflictException('This event was cancelled');
    const now = Date.now();
    const closes = event.registration_closes_at
      ? new Date(event.registration_closes_at).getTime()
      : new Date(event.starts_at).getTime();
    if (now >= closes) throw new ConflictException('Registration has closed');
    if (!fitsMode(event.mode, dto.attendance))
      throw new BadRequestException(
        dto.attendance === 'online'
          ? 'This event is in person only'
          : 'This event is online only',
      );

    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('email, first_name_encrypted, last_name_encrypted')
      .eq('id', userId)
      .maybeSingle();
    const profileName = [
      this.decrypt(profile?.first_name_encrypted),
      this.decrypt(profile?.last_name_encrypted),
    ]
      .filter(Boolean)
      .join(' ');
    const name = dto.name || profileName;
    if (!name) throw new BadRequestException('Add your name to register');
    const shareEmail = dto.shareEmail === true;
    const capacity =
      dto.attendance === 'in_person'
        ? event.capacity_in_person
        : event.capacity_online;

    // One registration at a time per event, so the last places can't be taken twice.
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `event:${event.id}`,
      ]);
      const existing = await client.query(
        'SELECT id, status FROM event_registrations WHERE event_id = $1 AND user_id = $2',
        [event.id, userId],
      );
      if (existing.rows[0]?.status === 'registered') {
        await client.query('ROLLBACK');
        throw new ConflictException('You are already registered');
      }
      if (capacity) {
        const taken = await client.query(
          "SELECT count(*)::int AS n FROM event_registrations WHERE event_id = $1 AND attendance = $2 AND status = 'registered'",
          [event.id, dto.attendance],
        );
        if (taken.rows[0].n >= capacity) {
          await client.query('ROLLBACK');
          throw new ConflictException(
            dto.attendance === 'in_person'
              ? 'In-person places are full'
              : 'Online places are full',
          );
        }
      }
      const values = [
        this.encryption.encrypt(name),
        shareEmail && profile?.email
          ? this.encryption.encrypt(profile.email)
          : null,
        shareEmail && !!profile?.email,
        dto.attendance,
        checkInCode(),
        dto.source ?? 'link',
      ];
      let regId: string;
      if (existing.rows[0]) {
        regId = existing.rows[0].id;
        await client.query(
          `UPDATE event_registrations SET name_encrypted = $1, email_encrypted = $2, share_email = $3,
             attendance = $4, check_in_code = $5, source = $6, status = 'registered',
             checked_in_at = NULL, updated_at = now() WHERE id = $7`,
          [...values, regId],
        );
      } else {
        const inserted = await client.query(
          `INSERT INTO event_registrations
             (event_id, user_id, name_encrypted, email_encrypted, share_email, attendance, check_in_code, source)
           VALUES ($7, $8, $1, $2, $3, $4, $5, $6) RETURNING id`,
          [...values, event.id, userId],
        );
        regId = inserted.rows[0].id;
      }
      await client.query('COMMIT');
      await this.notices.sendConfirmation(regId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof ConflictException) throw error;
      logger.error('Event registration failed', { error });
      throw new BadRequestException('Could not register. Try again.');
    } finally {
      client.release();
    }
    return this.memberView(slug, userId);
  }

  // Guests can change email sharing until the event ends.
  async setSharing(userId: string, slug: string, shareEmail: boolean) {
    const { event, reg } = await this.myRegistration(userId, slug);
    if (new Date(event.ends_at).getTime() <= Date.now())
      throw new ConflictException('This event has ended');
    let email: string | null = null;
    if (shareEmail) {
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
      email = profile?.email ? this.encryption.encrypt(profile.email) : null;
    }
    await this.admin
      .from('event_registrations')
      .update({
        share_email: shareEmail && !!email,
        email_encrypted: email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reg.id);
    return { shareEmail: shareEmail && !!email };
  }

  async cancelRegistration(userId: string, slug: string) {
    const { reg } = await this.myRegistration(userId, slug);
    await this.admin
      .from('event_registrations')
      .update({
        status: 'cancelled',
        share_email: false,
        email_encrypted: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reg.id);
    return { success: true };
  }

  // My Events: registered (active and past) and hosting.
  async myEvents(userId: string) {
    const now = Date.now();
    const { data: regs } = await this.admin
      .from('event_registrations')
      .select('event_id, attendance, share_email, status')
      .eq('user_id', userId)
      .eq('status', 'registered');
    const ids = (regs ?? []).map((r: any) => r.event_id);
    const [{ data: registered }, { data: hosting }] = await Promise.all([
      ids.length
        ? this.admin
            .from('events')
            .select(PUBLIC_COLUMNS)
            .in('id', ids)
            .not('status', 'in', HIDDEN_STATUSES)
            .order('starts_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      this.admin
        .from('events')
        .select(PUBLIC_COLUMNS)
        .eq('host_id', userId)
        .not('status', 'in', HIDDEN_STATUSES)
        .order('starts_at', { ascending: false }),
    ]);
    const attendanceOf = new Map(
      (regs ?? []).map((r: any) => [r.event_id, r.attendance]),
    );
    const sharingOf = new Map(
      (regs ?? []).map((r: any) => [r.event_id, !!r.share_email]),
    );
    const card = (e: any) => ({
      ...this.publicShape(e),
      attendance: attendanceOf.get(e.id) ?? null,
      shareEmail: sharingOf.get(e.id) ?? null,
    });
    const isActive = (e: any) =>
      e.status === 'published' && new Date(e.ends_at).getTime() > now;
    return {
      registered: {
        active: (registered ?? []).filter(isActive).map(card),
        past: (registered ?? []).filter((e: any) => !isActive(e)).map(card),
      },
      hosting: (hosting ?? []).map(card),
    };
  }

  async report(userId: string, eventId: string, reason: string) {
    const { data: event } = await this.admin
      .from('events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle();
    if (!event) throw new NotFoundException('Event not found');
    const { error } = await this.admin
      .from('event_reports')
      .insert({ event_id: eventId, reporter_id: userId, reason });
    if (error?.code === '23505')
      throw new ConflictException('You already reported this event');
    if (error) throw new BadRequestException('Could not send the report');
    return { success: true };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async bySlug(slug: string, all = false) {
    const { data } = await this.admin
      .from('events')
      .select(all ? ALL_COLUMNS : `${PUBLIC_COLUMNS}`)
      .eq('slug', slug)
      .maybeSingle();
    if (!data || HIDDEN_STATUSES.includes(data.status))
      throw new NotFoundException('Event not found');
    return data;
  }

  private async hostEvent(hostId: string, eventId: string) {
    const { data } = await this.admin
      .from('events')
      .select(ALL_COLUMNS)
      .eq('id', eventId)
      .maybeSingle();
    // Someone else's event is reported as missing.
    if (
      !data ||
      data.host_id !== hostId ||
      HIDDEN_STATUSES.includes(data.status)
    )
      throw new NotFoundException('Event not found');
    return data;
  }

  private async myRegistration(userId: string, slug: string) {
    const event = await this.bySlug(slug, true);
    const { data: reg } = await this.admin
      .from('event_registrations')
      .select('id, status')
      .eq('event_id', event.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!reg || reg.status !== 'registered')
      throw new NotFoundException('You are not registered for this event');
    return { event, reg };
  }

  private async guestList(eventId: string): Promise<Guest[]> {
    const { data } = await this.admin
      .from('event_registrations')
      .select(
        'id, name_encrypted, email_encrypted, share_email, attendance, checked_in_at, status, created_at',
      )
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    // The host sees names and shared emails only, never forum usernames.
    return (data ?? []).map((r: any) => ({
      registrationId: r.id,
      name: this.decrypt(r.name_encrypted) ?? 'Guest',
      email: r.share_email ? this.decrypt(r.email_encrypted) : null,
      attendance: r.attendance as Attendance,
      checkedInAt: r.checked_in_at,
      status: r.status,
      registeredAt: r.created_at,
    }));
  }

  private async counts(eventId: string) {
    const { data } = await this.admin
      .from('event_registrations')
      .select('attendance')
      .eq('event_id', eventId)
      .eq('status', 'registered');
    const rows = data ?? [];
    return {
      inPerson: rows.filter((r: any) => r.attendance === 'in_person').length,
      online: rows.filter((r: any) => r.attendance === 'online').length,
    };
  }

  private publicShape(e: any, counts?: { inPerson: number; online: number }) {
    const left = (cap: number | null, used?: number) =>
      cap == null || used == null ? null : Math.max(0, cap - used);
    const closes = e.registration_closes_at ?? e.starts_at;
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      description: e.description,
      mode: e.mode as EventMode,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      timeZone: e.time_zone,
      venueName: e.venue_name,
      venueCity: e.venue_city,
      organiserName: e.organiser_name,
      status: e.status,
      registrationOpen:
        e.status === 'published' && new Date(closes).getTime() > Date.now(),
      placesLeft: counts
        ? {
            inPerson: left(e.capacity_in_person, counts.inPerson),
            online: left(e.capacity_online, counts.online),
          }
        : undefined,
    };
  }

  private hostView(e: any) {
    return {
      ...this.publicShape(e),
      venueAddress: e.venue_address,
      mapUrl: e.map_url,
      joinUrl: e.join_url,
      capacityInPerson: e.capacity_in_person,
      capacityOnline: e.capacity_online,
      registrationClosesAt: e.registration_closes_at,
    };
  }

  private eventColumns(dto: Partial<CreateEventDto>, partial = false) {
    const map: Record<string, unknown> = {
      title: dto.title,
      description: dto.description,
      mode: dto.mode,
      starts_at: dto.startsAt && new Date(dto.startsAt).toISOString(),
      ends_at: dto.endsAt && new Date(dto.endsAt).toISOString(),
      time_zone: dto.timeZone,
      venue_name: dto.venueName,
      venue_address: dto.venueAddress,
      venue_city: dto.venueCity,
      map_url: dto.mapUrl,
      join_url: dto.joinUrl,
      capacity_in_person: dto.capacityInPerson,
      capacity_online: dto.capacityOnline,
      registration_closes_at:
        dto.registrationClosesAt &&
        new Date(dto.registrationClosesAt).toISOString(),
      organiser_name: dto.organiserName,
    };
    if (dto.timeZone !== undefined && !validTimeZone(dto.timeZone))
      throw new BadRequestException('Unknown time zone');
    if (map.description === null) map.description = '';
    for (const key of REQUIRED_FIELDS) {
      if (map[key] === null)
        throw new BadRequestException(
          `${key.replace(/_/g, ' ')} can't be empty`,
        );
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(map)) {
      if (v !== undefined) out[k] = v;
      else if (!partial) out[k] = null;
    }
    if (!partial && out.description == null) out.description = '';
    return out;
  }

  // Each mode needs its own details, and other modes' details are cleared.
  private checkShape(e: Record<string, any>) {
    const inPerson = e.mode === 'physical' || e.mode === 'hybrid';
    const online = e.mode === 'virtual' || e.mode === 'hybrid';
    if (inPerson && (!e.venue_name || !e.venue_address || !e.venue_city))
      throw new BadRequestException('Add the venue name, address and city');
    // The join link can be added later; guests are told when it is.
    if (!inPerson) {
      e.venue_name = null;
      e.venue_address = null;
      e.venue_city = null;
      e.map_url = null;
      e.capacity_in_person = null;
    }
    if (!online) {
      e.join_url = null;
      e.capacity_online = null;
    }
    const start = new Date(e.starts_at).getTime();
    const end = new Date(e.ends_at).getTime();
    if (!(end > start))
      throw new BadRequestException('The event must end after it starts');
    if (
      e.registration_closes_at &&
      new Date(e.registration_closes_at).getTime() > start
    )
      throw new BadRequestException(
        'Registration must close before the event starts',
      );
  }

  private decrypt(value?: string | null): string | null {
    if (!value) return null;
    try {
      return this.encryption.decrypt(value);
    } catch {
      return null;
    }
  }
}

function fitsMode(mode: EventMode, attendance: Attendance): boolean {
  if (mode === 'hybrid') return true;
  return mode === 'physical'
    ? attendance === 'in_person'
    : attendance === 'online';
}

function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  let tail = '';
  for (let i = 0; i < 6; i++)
    tail += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)].toLowerCase();
  return `${base || 'event'}-${tail}`;
}

function checkInCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// Spreadsheet apps run cells that start with these, so they are made plain text.
function csvCell(value: string | number | null | undefined): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
