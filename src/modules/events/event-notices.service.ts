import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import * as QRCode from 'qrcode';
import { supabaseAdmin } from '../../database/supabase.client';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { EmailService } from '../../common/utils/email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import logger from '../../common/utils/logger.util';
import { EVENTS_QUEUE, UPDATE_GROUP_MS } from './events.constants';

type NoticeKind = 'updated' | 'cancelled';

@Injectable()
export class EventNoticesService {
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

  // Edits within the window reach guests as one message: a later edit finds the job already waiting.
  async queueUpdate(eventId: string) {
    await this.queue
      .add(
        'updated',
        { eventId },
        {
          jobId: `event-updated-${eventId}`,
          delay: UPDATE_GROUP_MS,
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
      .catch((error) =>
        logger.warn('Could not queue an event update', { eventId, error }),
      );
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
          checkInCode: inPerson ? reg.check_in_code : null,
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
      noDetails?: boolean;
    },
  ) {
    const e = reg.event;
    const inPerson = reg.attendance === 'in_person';
    const showDetails = !extra.noDetails;
    return {
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
    const kind = job.name === 'cancelled' ? 'cancelled' : 'updated';
    const sent = await this.notices.notifyGuests(job.data.eventId, kind);
    logger.info('Event notice sent', { eventId: job.data.eventId, kind, sent });
  }
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
