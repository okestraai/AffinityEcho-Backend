import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventsService } from '../../modules/events/events.service';
import { calendarFile } from '../../modules/events/event-notices.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { getPool } from '../../database/pg-client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));
jest.mock('../../database/pg-client', () => ({ getPool: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('qrcode', () => ({ toBuffer: jest.fn() }));

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

describe('EventsService', () => {
  let client: any;
  let service: EventsService;
  let notices: { queueUpdate: jest.Mock; queueCancel: jest.Mock; sendConfirmation: jest.Mock };
  const encryption = {
    encrypt: jest.fn((t: string) => `enc_${t}`),
    decrypt: jest.fn((t: string) => t.replace(/^enc_/, '')),
  };
  const chain = (data: any, extra: any = {}) =>
    createMockQueryChain({ data, error: null, ...extra });

  const virtualDto = {
    title: 'Online talk',
    mode: 'virtual' as const,
    startsAt: future(5),
    endsAt: future(6),
    timeZone: 'Africa/Lagos',
    joinUrl: 'https://meet.example.com/a',
    organiserName: 'Host',
  };
  const event = {
    id: 'e1',
    slug: 'online-talk-abcdef',
    host_id: 'host',
    title: 'Talk',
    mode: 'hybrid',
    starts_at: future(5),
    ends_at: future(6),
    time_zone: 'UTC',
    venue_name: 'Hall',
    venue_address: '1 Main St',
    venue_city: 'Accra',
    map_url: 'https://maps.example.com',
    join_url: 'https://meet.example.com/a',
    capacity_in_person: 1,
    capacity_online: null,
    registration_closes_at: null,
    organiser_name: 'Host',
    status: 'published',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = createMockSupabaseClient().client;
    (supabaseAdmin as jest.Mock).mockReturnValue(client);
    notices = {
      queueUpdate: jest.fn(),
      queueCancel: jest.fn(),
      sendConfirmation: jest.fn(),
    };
    // Settings reads and the per-host create lock go through the pool.
    const lockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    (getPool as jest.Mock).mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(lockClient),
    });
    service = new EventsService(createMockConfigService() as any, encryption as any, notices as any);
  });

  describe('hosting', () => {
    it('refuses members who have not finished onboarding', async () => {
      client.from.mockReturnValueOnce(chain({ has_completed_onboarding: false }));
      await expect(service.create('u1', virtualDto)).rejects.toThrow(ForbiddenException);
    });

    it('asks a first-time host to accept the event policy', async () => {
      client.from.mockReturnValueOnce(chain({ has_completed_onboarding: true }));
      await expect(service.create('u1', virtualDto)).rejects.toThrow(BadRequestException);
    });

    it('allows 5 events a day', async () => {
      client.from
        .mockReturnValueOnce(chain({ has_completed_onboarding: true, event_policy_accepted_at: 'x' }))
        .mockReturnValueOnce(chain([], { count: 5 }));
      await expect(service.create('u1', virtualDto)).rejects.toThrow('up to 5 events a day');
    });

    it('checks the daily limit under a per-host lock, and always lets the lock go', async () => {
      client.from
        .mockReturnValueOnce(chain({ has_completed_onboarding: true, event_policy_accepted_at: 'x' }))
        .mockReturnValueOnce(chain([], { count: 5 }));
      await expect(service.create('u1', virtualDto)).rejects.toThrow('up to 5 events a day');
      const lockClient = await (getPool as jest.Mock).mock.results.at(-1)!.value.connect.mock.results[0].value;
      const sql = lockClient.query.mock.calls.map(([q]: [string]) => q);
      expect(sql[0]).toContain('pg_advisory_lock');
      expect(sql[1]).toContain('pg_advisory_unlock');
      expect(lockClient.query.mock.calls[0][1]).toEqual(['event-create:u1']);
      expect(lockClient.release).toHaveBeenCalled();
    });

    it('lets the join link be added later, but needs a full venue in person', async () => {
      const insert = chain({ ...event, mode: 'virtual', join_url: null });
      client.from
        .mockReturnValueOnce(chain({ has_completed_onboarding: true, event_policy_accepted_at: 'x' }))
        .mockReturnValueOnce(chain([], { count: 0 }))
        .mockReturnValueOnce(insert);
      await service.create('u1', { ...virtualDto, joinUrl: undefined });
      expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ mode: 'virtual', join_url: null }));

      client.from.mockReturnValue(chain({ has_completed_onboarding: true, event_policy_accepted_at: 'x' }, { count: 0 }));
      await expect(
        service.create('u1', { ...virtualDto, mode: 'physical', venueName: 'Hall', venueCity: 'Accra' }),
      ).rejects.toThrow('venue name, address and city');
    });

    it("clears the other mode's details", async () => {
      const insert = chain({ ...event, mode: 'physical' });
      client.from
        .mockReturnValueOnce(chain({ has_completed_onboarding: true, event_policy_accepted_at: 'x' }))
        .mockReturnValueOnce(chain([], { count: 0 }))
        .mockReturnValueOnce(insert);
      await service.create('u1', {
        ...virtualDto,
        mode: 'physical',
        venueName: 'Hall',
        venueAddress: '1 Main St',
        venueCity: 'Accra',
        joinUrl: 'https://meet.example.com/leftover',
      });
      expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ join_url: null, venue_name: 'Hall' }));
    });

    it('refuses an unknown time zone and an end before the start', async () => {
      client.from.mockReturnValue(chain({ has_completed_onboarding: true, event_policy_accepted_at: 'x' }, { count: 0 }));
      await expect(service.create('u1', { ...virtualDto, timeZone: 'Mars/Base' })).rejects.toThrow('time zone');
      await expect(
        service.create('u1', { ...virtualDto, endsAt: virtualDto.startsAt }),
      ).rejects.toThrow('end after it starts');
    });

    it('tells guests only about changes that matter to them', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain(event));
      await service.update('host', 'e1', { description: 'New words' });
      expect(notices.queueUpdate).not.toHaveBeenCalled();

      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain({ ...event, venue_name: 'Other hall' }));
      await service.update('host', 'e1', { venueName: 'Other hall' });
      expect(notices.queueUpdate).toHaveBeenCalledWith('e1');
    });

    it("clears the old mode's details when the mode changes", async () => {
      const update = chain({ ...event, mode: 'physical', join_url: null });
      client.from.mockReturnValueOnce(chain(event)).mockReturnValueOnce(update);
      await service.update('host', 'e1', { mode: 'physical' });
      expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ mode: 'physical', join_url: null }));
    });

    it('refuses to empty a required field but clears an optional one', async () => {
      client.from.mockReturnValueOnce(chain(event));
      await expect(service.update('host', 'e1', { title: null } as any)).rejects.toThrow("title can't be empty");

      const update = chain(event);
      client.from.mockReturnValueOnce(chain(event)).mockReturnValueOnce(update);
      await service.update('host', 'e1', { mapUrl: null } as any);
      expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ map_url: null }));
    });

    it("hides another member's event from a would-be host", async () => {
      client.from.mockReturnValueOnce(chain(event));
      await expect(service.hostPage('someone-else', 'e1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleting', () => {
    it('hides the event and tells guests of an upcoming event', async () => {
      const update = chain([{ id: 'e1' }]);
      client.from.mockReturnValueOnce(chain(event)).mockReturnValueOnce(update);
      await service.remove('host', 'e1');
      expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'deleted' }));
      expect(notices.queueCancel).toHaveBeenCalledWith('e1');
    });

    it("doesn't message guests about a past event", async () => {
      client.from
        .mockReturnValueOnce(chain({ ...event, ends_at: future(-1) }))
        .mockReturnValueOnce(chain([{ id: 'e1' }]));
      await service.remove('host', 'e1');
      expect(notices.queueCancel).not.toHaveBeenCalled();
    });

    it('treats a deleted event as missing', async () => {
      client.from.mockReturnValueOnce(chain({ ...event, status: 'deleted' }));
      await expect(service.publicView(event.slug)).rejects.toThrow(NotFoundException);
    });
  });

  describe('reveal with the event code', () => {
    it('shows an in-person guest the address and not the join link', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain({ id: 'r1', attendance: 'in_person', status: 'registered' }));
      const details = await service.revealWithCode(event.slug, ' abcd2345 ');
      expect(details).toMatchObject({ venueAddress: '1 Main St', joinUrl: null });
    });

    it('shows an online guest the join link and not the address', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain({ id: 'r1', attendance: 'online', status: 'registered' }));
      const details = await service.revealWithCode(event.slug, 'ABCD2345');
      expect(details).toMatchObject({ venueAddress: null, joinUrl: 'https://meet.example.com/a' });
    });

    it('refuses a wrong or cancelled code', async () => {
      client.from.mockReturnValueOnce(chain(event)).mockReturnValueOnce(chain(null));
      await expect(service.revealWithCode(event.slug, 'NOPE1234')).rejects.toThrow(NotFoundException);
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain({ id: 'r1', attendance: 'online', status: 'cancelled' }));
      await expect(service.revealWithCode(event.slug, 'ABCD2345')).rejects.toThrow(NotFoundException);
    });
  });

  describe('what guests see', () => {
    it('never shows the address or join link on the public page', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain([]));
      const view: any = await service.publicView(event.slug);
      expect(view.venueName).toBe('Hall');
      expect(JSON.stringify(view)).not.toContain('1 Main St');
      expect(JSON.stringify(view)).not.toContain('meet.example.com');
    });

    it('shows the full details only to guests and the host', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain([]));
      expect((await service.memberView(event.slug, 'stranger')).details).toBeNull();

      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain({ id: 'r1', status: 'registered', attendance: 'in_person' }))
        .mockReturnValueOnce(chain([]));
      expect((await service.memberView(event.slug, 'guest')).details?.venueAddress).toBe('1 Main St');
    });

    it('shows the host names and only shared emails, never usernames', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain([], { count: 3 }))
        .mockReturnValueOnce(
          chain([
            { id: 'r1', name_encrypted: 'enc_Ada', email_encrypted: 'enc_ada@x.com', share_email: true, attendance: 'online', status: 'registered', created_at: future(0) },
            { id: 'r2', name_encrypted: 'enc_Bo', email_encrypted: null, share_email: false, attendance: 'in_person', status: 'registered', created_at: future(0) },
          ]),
        );
      const page: any = await service.hostPage('host', 'e1');
      expect(page.guests.map((g: any) => [g.name, g.email])).toEqual([
        ['Ada', 'ada@x.com'],
        ['Bo', null],
      ]);
      expect(page.stats).toMatchObject({ linkOpens: 3, inPerson: 1, online: 1 });
      expect(JSON.stringify(page)).not.toContain('username');
    });

    it('makes CSV cells that start a formula plain text', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(
          chain([{ id: 'r1', name_encrypted: 'enc_=HYPERLINK("x")', share_email: false, attendance: 'online', status: 'registered', created_at: future(0) }]),
        );
      const csv = await service.guestCsv('host', 'e1');
      expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    });
  });

  describe('registration', () => {
    const pool = (queries: any[]) => {
      const query = jest.fn();
      for (const q of queries) query.mockResolvedValueOnce(q);
      query.mockResolvedValue({ rows: [] });
      const release = jest.fn();
      (getPool as jest.Mock).mockReturnValue({ connect: jest.fn().mockResolvedValue({ query, release }) });
      return query;
    };

    it('refuses the wrong way of attending for the event', async () => {
      client.from.mockReturnValueOnce(chain({ ...event, mode: 'virtual' }));
      await expect(service.register('u1', event.slug, { attendance: 'in_person' })).rejects.toThrow(
        'online only',
      );
    });

    it('refuses once registration has closed', async () => {
      client.from.mockReturnValueOnce(chain({ ...event, registration_closes_at: future(-1) }));
      await expect(service.register('u1', event.slug, { attendance: 'online' })).rejects.toThrow(ConflictException);
    });

    it('refuses when the in-person places are full', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain({ email: 'a@x.com', first_name_encrypted: 'enc_Ada' }));
      const query = pool([{}, {}, { rows: [] }, { rows: [{ n: 1 }] }]);
      await expect(service.register('u1', event.slug, { attendance: 'in_person' })).rejects.toThrow(
        'In-person places are full',
      );
      expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['event:e1']);
    });

    it('keeps the email only when the guest shares it', async () => {
      client.from
        .mockReturnValueOnce(chain(event))
        .mockReturnValueOnce(chain({ email: 'a@x.com', first_name_encrypted: 'enc_Ada' }))
        .mockReturnValue(chain(null));
      const query = pool([{}, {}, { rows: [] }, { rows: [{ id: 'r1' }] }]);
      await service.register('u1', event.slug, { attendance: 'online' }).catch(() => undefined);
      const insert = query.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO event_registrations'));
      expect(insert[1].slice(0, 3)).toEqual(['enc_Ada', null, false]);
    });
  });
});

describe('calendarFile', () => {
  it('uses the details for how the guest attends, escaped', () => {
    const e = {
      id: 'e1',
      title: 'Talk; with, commas',
      starts_at: '2026-12-10T17:00:00.000Z',
      ends_at: '2026-12-10T19:00:00.000Z',
      venue_name: 'Hall',
      venue_address: '1 Main St',
      venue_city: 'Accra',
      join_url: 'https://meet.example.com/a',
      organiser_name: 'Host',
    };
    const inPerson = calendarFile(e, true, null);
    expect(inPerson).toContain('DTSTART:20261210T170000Z');
    expect(inPerson).toContain('SUMMARY:Talk\\; with\\, commas');
    expect(inPerson).toContain('LOCATION:Hall\\, 1 Main St\\, Accra');
    expect(calendarFile(e, false, null)).toContain('LOCATION:https://meet.example.com/a');
  });
});
