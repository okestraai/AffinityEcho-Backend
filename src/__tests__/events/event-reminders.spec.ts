import {
  EventNoticesProcessor,
  EventNoticesService,
  hostActivityText,
  startText,
} from '../../modules/events/event-notices.service';
import { eventSettings } from '../../modules/events/event-settings';
import { getPool } from '../../database/pg-client';
import { createMockConfigService } from '../helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(() => ({})),
  supabaseClient: jest.fn(),
}));
jest.mock('../../database/pg-client', () => ({ getPool: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('qrcode', () => ({ toBuffer: jest.fn() }));
jest.mock('../../modules/events/event-settings', () => ({
  eventSettings: jest.fn(),
}));

const settings = (events: Record<string, unknown>) =>
  (eventSettings as jest.Mock).mockResolvedValue({
    events: {
      update_grouping_minutes: 2,
      reminders_enabled: true,
      host_notices_enabled: true,
      ...events,
    },
    storage: {},
  });

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-12-01T10:00:00Z');

describe('event reminders', () => {
  let query: jest.Mock;
  let notifications: { createNotification: jest.Mock };
  let email: { sendEmail: jest.Mock };
  let service: EventNoticesService;

  beforeEach(() => {
    jest.clearAllMocks();
    settings({});
    query = jest.fn().mockResolvedValue({ rows: [] });
    (getPool as jest.Mock).mockReturnValue({ query });
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    service = new EventNoticesService(
      createMockConfigService() as any,
      { decrypt: (v: string) => v.replace('enc_', '') } as any,
      email as any,
      notifications as any,
      {} as any,
    );
  });

  it('sends nothing when an admin has switched reminders off', async () => {
    settings({ reminders_enabled: false });
    expect(await service.sendReminders(now)).toEqual({ day: 0, hour: 0 });
    expect(query).not.toHaveBeenCalled();
  });

  it('claims day reminders 2 to 24 hours ahead, skipping people who only just registered', async () => {
    await service.sendReminders(now);
    const day = query.mock.calls.find((c) =>
      String(c[0]).includes('SET reminded_day_at = now()'),
    );
    expect(day[1]).toEqual([
      new Date(now.getTime() + 2 * HOUR),
      new Date(now.getTime() + 24 * HOUR),
      new Date(now.getTime() - HOUR),
    ]);
    expect(day[0]).toContain('reminded_day_at IS NULL');
    expect(day[0]).toContain("e.status = 'published'");
  });

  it('claims hour reminders in the last 75 minutes, and marks the day reminder done so it never comes late', async () => {
    await service.sendReminders(now);
    const hour = query.mock.calls.find((c) =>
      String(c[0]).includes('SET reminded_hour_at = now()'),
    );
    expect(hour[0]).toContain(
      'reminded_day_at = COALESCE(r.reminded_day_at, now())',
    );
    expect(hour[1]).toEqual([
      now,
      new Date(now.getTime() + 75 * 60 * 1000),
      new Date(now.getTime() - 15 * 60 * 1000),
    ]);
  });

  it('sends one reminder per claimed guest', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'r2' }, { id: 'r3' }] });
    const send = jest
      .spyOn(service as any, 'sendReminder')
      .mockResolvedValue(true);
    expect(await service.sendReminders(now)).toEqual({ hour: 1, day: 2 });
    expect(send.mock.calls).toEqual([
      ['r1', 'hour'],
      ['r2', 'day'],
      ['r3', 'day'],
    ]);
  });

  it('releases a reminder that could not be sent, so the next run tries again', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })
      .mockResolvedValue({ rows: [] });
    jest.spyOn(service as any, 'sendReminder').mockResolvedValueOnce(false);
    await service.sendReminders(now);
    expect(query).toHaveBeenCalledWith(
      'UPDATE event_registrations SET reminded_hour_at = NULL WHERE id = $1',
      ['r1'],
    );
  });

  const reg = (attendance: 'in_person' | 'online') => ({
    id: 'r1',
    user_id: 'u1',
    attendance,
    name_encrypted: 'enc_Ada',
    check_in_code: 'ABCD2345',
    email: 'ada@x.test',
    event: {
      id: 'e1',
      slug: 'career-night',
      title: 'Career night',
      starts_at: '2026-12-02T17:00:00Z',
      ends_at: '2026-12-02T19:00:00Z',
      time_zone: 'Africa/Lagos',
      mode: 'hybrid',
      join_url: 'https://meet.example.com/a',
      organiser_name: 'Host',
    },
  });

  it('gives an in-person guest the time and their check-in code, in the app and by email a day before', async () => {
    jest
      .spyOn(service as any, 'registration')
      .mockResolvedValue(reg('in_person'));
    await (service as any).sendReminder('r1', 'day');
    const notice = notifications.createNotification.mock.calls[0][0];
    expect(notice).toMatchObject({
      user_id: 'u1',
      type: 'event_reminder',
      title: 'Coming up: Career night',
      action_url: '/events/career-night',
    });
    expect(notice.message).toBe(
      'Starts on Wednesday 2 December at 18:00 GMT+1. Your check-in code is ABCD2345.',
    );
    expect(email.sendEmail).toHaveBeenCalledWith(
      'ada@x.test',
      'Coming up: Career night',
      'event-notice',
      expect.objectContaining({
        label: 'Event reminder',
        checkInCode: 'ABCD2345',
      }),
      [expect.objectContaining({ filename: 'event.ics' })],
    );
  });

  it('points an online guest to the join link an hour before, without an email', async () => {
    jest.spyOn(service as any, 'registration').mockResolvedValue(reg('online'));
    await (service as any).sendReminder('r1', 'hour');
    expect(notifications.createNotification.mock.calls[0][0]).toMatchObject({
      title: 'Starting soon: Career night',
      message: 'Starts at 18:00 GMT+1. The join link is on the event page.',
    });
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});

describe('host notices', () => {
  let query: jest.Mock;
  let lock: jest.Mock;
  let notifications: { createNotification: jest.Mock };
  let service: EventNoticesService;
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    settings({});
    query = jest.fn();
    // BEGIN and the registration lock come first, then the claim and the counts.
    const inTx = jest.fn(async (sql: string, args?: any[]) =>
      /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) || sql.includes('pg_advisory')
        ? { rows: [] }
        : query(sql, args),
    );
    (getPool as jest.Mock).mockReturnValue({
      connect: jest.fn().mockResolvedValue({ query: inTx, release: jest.fn() }),
    });
    lock = inTx;
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    service = new EventNoticesService(
      createMockConfigService() as any,
      {} as any,
      {} as any,
      notifications as any,
      queue as any,
    );
  });

  it('groups new guests over the admin window, like update messages', async () => {
    settings({ update_grouping_minutes: 3 });
    await service.queueHostActivity('e1');
    expect(queue.add).toHaveBeenCalledWith(
      'host_activity',
      { eventId: 'e1' },
      expect.objectContaining({ jobId: 'event-host-e1', delay: 180000 }),
    );
  });

  it('tells the host who registered and cancelled since the last notice, and how many are going', async () => {
    const since = new Date('2026-12-01T09:00:00Z');
    const until = new Date('2026-12-01T09:02:00Z');
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'e1',
            slug: 's',
            title: 'Career night',
            host_id: 'h1',
            since,
            until,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ joined: 2, left_: 1, going: 14 }] });
    expect(await service.notifyHost('e1')).toBe(1);
    expect(lock).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['event:e1'],
    );
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][1]).toEqual(['e1', since, 'h1', until]);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'h1',
        type: 'event_host_activity',
        title: 'Guests: Career night',
        message: '2 people registered and 1 cancelled. 14 going.',
        action_url: '/events/manage/e1',
      }),
    );
  });

  it('says nothing when nobody registered or cancelled', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'e1', title: 't', host_id: 'h1', since: null }],
      })
      .mockResolvedValueOnce({ rows: [{ joined: 0, left_: 0, going: 3 }] });
    expect(await service.notifyHost('e1')).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('says nothing for an event that is no longer published, or when an admin has switched host notices off', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await service.notifyHost('e1')).toBe(0);
    settings({ host_notices_enabled: false });
    expect(await service.notifyHost('e1')).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});

describe('notice wording', () => {
  it('names the day only for the day-before reminder', () => {
    expect(startText('2026-12-02T17:00:00Z', 'Africa/Lagos', true)).toBe(
      'on Wednesday 2 December at 18:00 GMT+1',
    );
    expect(startText('2026-12-02T17:00:00Z', 'Africa/Lagos', false)).toBe(
      'at 18:00 GMT+1',
    );
  });

  it('counts people correctly', () => {
    expect(hostActivityText(1, 0, 1)).toBe('1 person registered. 1 going.');
    expect(hostActivityText(0, 2, 5)).toBe('2 cancelled. 5 going.');
  });
});

describe('the notice worker', () => {
  const notices = {
    sendReminders: jest.fn().mockResolvedValue({ day: 0, hour: 0 }),
    notifyHost: jest.fn(),
    notifyGuests: jest.fn().mockResolvedValue(0),
  };
  const worker = new EventNoticesProcessor(notices as any);

  it('runs the reminder check, host notices and guest notices by job name', async () => {
    await worker.process({ name: 'reminders', data: {} } as any);
    await worker.process({
      name: 'host_activity',
      data: { eventId: 'e1' },
    } as any);
    await worker.process({ name: 'updated', data: { eventId: 'e2' } } as any);
    expect(notices.sendReminders).toHaveBeenCalled();
    expect(notices.notifyHost).toHaveBeenCalledWith('e1');
    expect(notices.notifyGuests).toHaveBeenCalledWith('e2', 'updated');
    expect(notices.notifyGuests).toHaveBeenCalledTimes(1);
  });
});
