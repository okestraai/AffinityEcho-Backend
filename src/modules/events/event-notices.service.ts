import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import * as QRCode from 'qrcode';
import { supabaseAdmin } from '../../database/supabase.client';
import { getPool } from '../../database/pg-client';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { EmailService } from '../../common/utils/email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import logger from '../../common/utils/logger.util';
import { trackServerEvent } from '../analytics/server-events';
import { EVENTS_QUEUE } from './events.constants';
import { eventSettings } from './event-settings';

type NoticeKind = 'updated' | 'cancelled';
type ReminderKind = 'day' | 'hour';

const HOUR = 60 * 60 * 1000;
const REMINDER_CHECK_MS = 5 * 60 * 1000;

@Injectable()
export class EventNoticesService implements OnModuleInit {
  private admin;
  private readonly appUrl: string;

  constructor(
    config: ConfigService,
    private readonly encryption: EncryptionUtil,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    @InjectQueue(EVENTS_QUEUE) private readonly queue: Queue,
  ) {
    this.admin = supabaseAdmin(config);
    this.appUrl = (config.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '');
  }

  // One reminder check every few minutes, however many servers run; the queue keeps a single schedule.
  async onModuleInit() {
    await this.queue
      .upsertJobScheduler(
        'event-reminders',
        { every: REMINDER_CHECK_MS },
        {
          name: 'reminders',
          data: {},
          opts: { removeOnComplete: true, removeOnFail: true },
        },
      )
      .catch((error) =>
        logger.warn('Could not schedule event reminders', { error }),
      );
  }

  // Edits within the window reach guests as one message: a later edit finds the job already waiting.
  async queueUpdate(eventId: string) {
    await this.queueGrouped('updated', `event-updated-${eventId}`, eventId);
  }

  // New guests and cancellations within the window reach the host as one notice.
  async queueHostActivity(eventId: string) {
    await this.queueGrouped('host_activity', `event-host-${eventId}`, eventId);
  }

  private async queueGrouped(name: string, baseJobId: string, eventId: string) {
    const minutes = (await eventSettings()).events.update_grouping_minutes;
    // A message already being sent can't take this change, so the change gets a message of its own.
    let jobId = baseJobId;
    const waiting = await this.queue.getJob(jobId).catch(() => undefined);
    if (
      waiting &&
      (await waiting.getState().catch(() => 'unknown')) === 'active'
    )
      jobId = `${jobId}-${Date.now()}`;
    await this.queue
      .add(
        name,
        { eventId },
        {
          jobId,
          delay: minutes * 60 * 1000,
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
      .catch((error) =>
        logger.warn('Could not queue an event notice', {
          name,
          eventId,
          error,
        }),
      );
  }

  // Reminders a day and an hour before. Each guest's reminder is claimed before it is sent, so it goes once.
  async sendReminders(now = new Date()) {
    if (!(await eventSettings()).events.reminders_enabled)
      return { day: 0, hour: 0 };
    const hour = await this.remind('hour', now);
    const day = await this.remind('day', now);
    return { day, hour };
  }

  private async remind(kind: ReminderKind, now: Date) {
    const t = now.getTime();
    // Day reminders 2 to 24 hours ahead, hour reminders in the last 75 minutes, never right after registering.
    const [from, to, registeredBefore] =
      kind === 'day'
        ? [t + 2 * HOUR, t + 24 * HOUR, t - HOUR]
        : [t, t + 75 * 60 * 1000, t - 15 * 60 * 1000];
    const column = kind === 'day' ? 'reminded_day_at' : 'reminded_hour_at';
    const { rows } = await getPool().query(
      `UPDATE event_registrations r
          SET ${column} = now()${kind === 'hour' ? ', reminded_day_at = COALESCE(r.reminded_day_at, now())' : ''}
         FROM events e
        WHERE r.event_id = e.id AND e.status = 'published' AND e.deleted_at IS NULL
          AND r.status = 'registered' AND r.${column} IS NULL AND r.user_id <> e.host_id
          AND e.starts_at > $1 AND e.starts_at <= $2 AND r.registered_at <= $3
      RETURNING r.id`,
      [new Date(from), new Date(to), new Date(registeredBefore)],
    );
    for (const row of rows) {
      // A reminder that couldn't be sent is released, so the next run tries again.
      if (!(await this.sendReminder(row.id, kind)))
        await getPool()
          .query(
            `UPDATE event_registrations SET ${column} = NULL WHERE id = $1`,
            [row.id],
          )
          .catch(() => undefined);
    }
    return rows.length;
  }

  private async sendReminder(registrationId: string, kind: ReminderKind) {
    try {
      const reg = await this.registration(registrationId);
      if (!reg) return true;
      const e = reg.event;
      const inPerson = reg.attendance === 'in_person';
      const start = startText(e.starts_at, e.time_zone, kind === 'day');
      const how = inPerson
        ? `Your check-in code is ${reg.check_in_code}.`
        : e.join_url
          ? 'The join link is on the event page.'
          : "The host hasn't added the join link yet.";
      const title =
        kind === 'day' ? `Coming up: ${e.title}` : `Starting soon: ${e.title}`;
      await this.notifications.createNotification({
        user_id: reg.user_id,
        type: 'event_reminder',
        title,
        message: `Starts ${start}. ${how}`,
        action_url: `/events/${e.slug}`,
        reference_id: e.id,
        reference_type: 'event',
      } as any);
      // The day reminder also comes by email, with the details and the calendar file.
      if (kind === 'day') {
        await this.email
          .sendEmail(
            reg.email,
            title,
            'event-notice',
            this.emailData(reg, {
              label: 'Event reminder',
              heading: e.title,
              intro: `Starts ${start}.`,
              checkInCode: inPerson ? reg.check_in_code : null,
            }),
            [
              {
                filename: 'event.ics',
                content: calendarFile(e, inPerson, this.eventUrl(e.slug)),
                contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
              },
            ],
          )
          .catch((error) =>
            logger.warn('Event reminder email failed', { error }),
          );
      }
      return true;
    } catch (error) {
      logger.warn('Could not send an event reminder', {
        registrationId,
        error,
      });
      return false;
    }
  }

  // Tells the host how many people registered or cancelled since the last notice.
  async notifyHost(eventId: string) {
    if (!(await eventSettings()).events.host_notices_enabled) return 0;
    // Takes the registration lock, so a guest still registering lands in this notice or the next.
    const client = await getPool().connect();
    let event: any;
    let n: any;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `event:${eventId}`,
      ]);
      ({
        rows: [event],
      } = await client.query(
        `WITH before AS (SELECT host_notified_at FROM events WHERE id = $1 FOR UPDATE)
         UPDATE events e SET host_notified_at = clock_timestamp() FROM before
          WHERE e.id = $1 AND e.status = 'published' AND e.deleted_at IS NULL
         RETURNING e.id, e.slug, e.title, e.host_id, before.host_notified_at AS since, e.host_notified_at AS until`,
        [eventId],
      ));
      if (event)
        ({
          rows: [n],
        } = await client.query(
          `SELECT count(*) FILTER (WHERE status = 'registered' AND registered_at > $2 AND registered_at <= $4)::int AS joined,
                  count(*) FILTER (WHERE status = 'cancelled' AND cancelled_at > $2 AND cancelled_at <= $4 AND registered_at <= $2)::int AS left_,
                  count(*) FILTER (WHERE status = 'registered')::int AS going
             FROM event_registrations WHERE event_id = $1 AND user_id <> $3`,
          [eventId, event.since ?? new Date(0), event.host_id, event.until],
        ));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    if (!event) return 0;
    if (!n.joined && !n.left_) return 0;
    await this.notifications
      .createNotification({
        user_id: event.host_id,
        type: 'event_host_activity',
        title: `Guests: ${event.title}`,
        message: hostActivityText(n.joined, n.left_, n.going),
        action_url: `/events/manage/${event.id}`,
        reference_id: event.id,
        reference_type: 'event',
      } as any)
      .catch((error) => logger.warn('Host notice failed', { error }));
    return 1;
  }

  async queueCancel(eventId: string) {
    // A cancelled event needs no update notice.
    await this.queue.remove(`event-updated-${eventId}`).catch(() => undefined);
    await this.queue
      .add(
        'cancelled',
        { eventId },
        { removeOnComplete: true, removeOnFail: true },
      )
      .catch((error) =>
        logger.warn('Could not queue an event cancellation', {
          eventId,
          error,
        }),
      );
  }

  // The guest's confirmation: details for their choice, a calendar file, and a QR to check in.
  async sendConfirmation(registrationId: string) {
    try {
      const reg = await this.registration(registrationId);
      if (!reg) return;
      const inPerson = reg.attendance === 'in_person';
      const attachments: any[] = [
        {
          filename: 'event.ics',
          content: calendarFile(
            reg.event,
            inPerson,
            this.eventUrl(reg.event.slug),
          ),
          contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
        },
      ];
      if (inPerson) {
        attachments.push({
          filename: 'check-in.png',
          content: await QRCode.toBuffer(reg.check_in_code, {
            width: 360,
            margin: 1,
          }),
          contentType: 'image/png',
          cid: 'checkin-qr',
        });
      }
      await this.email.sendEmail(
        reg.email,
        `You're registered: ${reg.event.title}`,
        'event-notice',
        this.emailData(reg, {
          label: "You're registered",
          heading: reg.event.title,
          intro:
            'Here are the details for your place. The calendar file is attached.',
          checkInCode: reg.check_in_code,
          showQr: inPerson,
        }),
        attachments,
      );
    } catch (error) {
      // The registration stands even if the email fails; the details are on the event page.
      logger.warn('Could not send an event confirmation', {
        registrationId,
        error,
      });
    }
  }

  async notifyGuests(eventId: string, kind: NoticeKind) {
    const { data: event } = await this.admin
      .from('events')
      .select(
        'id, slug, title, starts_at, ends_at, time_zone, mode, venue_name, venue_address, venue_city, map_url, join_url, organiser_name, status',
      )
      .eq('id', eventId)
      .maybeSingle();
    if (!event) return 0;
    if (kind === 'updated' && event.status !== 'published') return 0;

    const { data: regs } = await this.admin
      .from('event_registrations')
      .select('id, user_id, attendance, name_encrypted, check_in_code')
      .eq('event_id', eventId)
      .eq('status', 'registered');
    let sent = 0;
    for (const r of regs ?? []) {
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('email')
        .eq('id', r.user_id)
        .maybeSingle();
      const reg = { ...r, email: profile?.email, event };
      const title =
        kind === 'cancelled'
          ? `Cancelled: ${event.title}`
          : `Updated: ${event.title}`;
      const message =
        kind === 'cancelled'
          ? 'The host cancelled this event.'
          : 'The host changed the details. Check the time and place.';
      await this.notifications
        .createNotification({
          user_id: r.user_id,
          type: kind === 'cancelled' ? 'event_cancelled' : 'event_updated',
          title,
          message,
          action_url: `/events/${event.slug}`,
          reference_id: event.id,
          reference_type: 'event',
        } as any)
        .catch((error) => logger.warn('Event notice failed', { error }));
      if (reg.email) {
        await this.email
          .sendEmail(
            reg.email,
            title,
            'event-notice',
            this.emailData(reg, {
              label: kind === 'cancelled' ? 'Event cancelled' : 'Event updated',
              heading: event.title,
              intro: message,
              checkInCode: null,
              noDetails: kind === 'cancelled',
            }),
            kind === 'updated'
              ? [
                  {
                    filename: 'event.ics',
                    content: calendarFile(
                      event,
                      r.attendance === 'in_person',
                      this.eventUrl(event.slug),
                    ),
                    contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
                  },
                ]
              : undefined,
          )
          .catch((error) => logger.warn('Event email failed', { error }));
      }
      sent += 1;
    }
    return sent;
  }

  private async registration(id: string) {
    const { data: reg } = await this.admin
      .from('event_registrations')
      .select(
        'id, user_id, attendance, name_encrypted, check_in_code, event_id',
      )
      .eq('id', id)
      .maybeSingle();
    if (!reg) return null;
    const [{ data: event }, { data: profile }] = await Promise.all([
      this.admin
        .from('events')
        .select(
          'id, slug, title, starts_at, ends_at, time_zone, mode, venue_name, venue_address, venue_city, map_url, join_url, organiser_name',
        )
        .eq('id', reg.event_id)
        .maybeSingle(),
      this.admin
        .from('user_profiles')
        .select('email')
        .eq('id', reg.user_id)
        .maybeSingle(),
    ]);
    if (!event || !profile?.email) return null;
    return { ...reg, event, email: profile.email };
  }

  private emailData(
    reg: any,
    extra: {
      label: string;
      heading: string;
      intro: string;
      checkInCode: string | null;
      showQr?: boolean;
      noDetails?: boolean;
    },
  ) {
    const e = reg.event;
    const inPerson = reg.attendance === 'in_person';
    const showDetails = !extra.noDetails;
    return {
      showQr: false,
      ...extra,
      name: this.decrypt(reg.name_encrypted) ?? 'there',
      title: e.title,
      when: whenText(e.starts_at, e.ends_at, e.time_zone),
      venue:
        showDetails && inPerson && e.venue_name
          ? [e.venue_name, e.venue_address, e.venue_city]
              .filter(Boolean)
              .join(', ')
          : null,
      mapUrl: showDetails && inPerson ? e.map_url : null,
      joinUrl: showDetails && !inPerson ? e.join_url : null,
      organiser: e.organiser_name,
      eventUrl: this.eventUrl(e.slug),
    };
  }

  private eventUrl(slug: string) {
    return this.appUrl ? `${this.appUrl}/events/${slug}` : null;
  }

  private decrypt(value?: string | null) {
    if (!value) return null;
    try {
      return this.encryption.decrypt(value);
    } catch {
      return null;
    }
  }
}

@Processor(EVENTS_QUEUE)
export class EventNoticesProcessor extends WorkerHost {
  constructor(private readonly notices: EventNoticesService) {
    super();
  }

  async process(job: Job<{ eventId: string }>) {
    if (job.name === 'reminders') {
      const sent = await this.notices.sendReminders();
      if (sent.day || sent.hour) logger.info('Event reminders sent', sent);
      return;
    }
    if (job.name === 'host_activity') {
      await this.notices.notifyHost(job.data.eventId);
      return;
    }
    const kind = job.name === 'cancelled' ? 'cancelled' : 'updated';
    const sent = await this.notices.notifyGuests(job.data.eventId, kind);
    logger.info('Event notice sent', { eventId: job.data.eventId, kind, sent });
    if (sent > 0)
      trackServerEvent('event_updated_notified', null, {
        eventId: job.data.eventId,
        kind,
        guests: sent,
      });
  }
}

// When the event starts, in its own time zone: "on Saturday 28 November at 18:00 GMT+1" or "at 18:00 GMT+1".
export function startText(
  startsAt: string,
  timeZone: string,
  withDay: boolean,
) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(startsAt));
  if (!withDay) return `at ${time}`;
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(startsAt));
  return `on ${day} at ${time}`;
}

// "2 people registered and 1 cancelled. 14 going."
export function hostActivityText(joined: number, left: number, going: number) {
  const parts: string[] = [];
  if (joined)
    parts.push(`${joined} ${joined === 1 ? 'person' : 'people'} registered`);
  if (left) parts.push(`${left} cancelled`);
  return `${parts.join(' and ')}. ${going} going.`;
}

export function whenText(startsAt: string, endsAt: string, timeZone: string) {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone, ...opts }).format(new Date(d));
  const day = fmt(startsAt, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const from = fmt(startsAt, { hour: '2-digit', minute: '2-digit' });
  const to = fmt(endsAt, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return `${day}, ${from} to ${to}`;
}

// A calendar file with the details for the guest's way of attending.
export function calendarFile(
  e: any,
  inPerson: boolean,
  url: string | null,
): string {
  const stamp = (d: string | Date) =>
    new Date(d)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const esc = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  const location = inPerson
    ? [e.venue_name, e.venue_address, e.venue_city].filter(Boolean).join(', ')
    : (e.join_url ?? '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Affinity Echo//Events//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@affinityecho.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.starts_at)}`,
    `DTEND:${stamp(e.ends_at)}`,
    `SUMMARY:${esc(e.title)}`,
    location ? `LOCATION:${esc(location)}` : '',
    url ? `URL:${url}` : '',
    `DESCRIPTION:${esc(`Hosted by ${e.organiser_name}${url ? `. ${url}` : ''}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}
