import { BadRequestException } from '@nestjs/common';
import { cleanCover, coverType, COVER_MAX_BYTES } from '../../modules/events/event-cover';
import { eventPhase } from '../../modules/events/events.service';

jest.mock('../../database/pg-client', () => ({ getPool: () => ({ query: jest.fn() }) }));

const seg = (marker: number, body: string) => {
  const data = Buffer.from(body, 'latin1');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(data.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, data]);
};
// A tiny JPEG shape: start, JFIF, a camera block, a comment, a table, then the image data.
const jpeg = (extra: Buffer[] = []) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, 'JFIF\0\x01\x01'),
    ...extra,
    seg(0xdb, 'TABLE'),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),
    Buffer.from('PIXELS', 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);

const chunk = (type: string, body: string) => {
  const data = Buffer.from(body, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
};
const png = (extra: Buffer[] = []) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', 'HEADER'),
    ...extra,
    chunk('IDAT', 'PIXELS'),
    chunk('IEND', ''),
  ]);

describe('event cover pictures', () => {
  it('knows the type from the bytes, not the file name', () => {
    expect(coverType(jpeg())).toBe('image/jpeg');
    expect(coverType(png())).toBe('image/png');
    expect(coverType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(coverType(Buffer.from('GIF89a......'))).toBeNull();
  });

  it('removes camera, location and comment data from a JPEG but keeps the picture', () => {
    const raw = jpeg([seg(0xe1, 'Exif\0\0GPS 6.45N 3.39E'), seg(0xe2, 'ICC'), seg(0xfe, 'taken at home')]);
    const { mime, data } = cleanCover(raw);
    const text = data.toString('latin1');
    expect(mime).toBe('image/jpeg');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('taken at home');
    expect(text).toContain('JFIF');
    expect(text).toContain('TABLE');
    expect(text).toContain('PIXELS');
  });

  it('removes text and camera chunks from a PNG but keeps the picture', () => {
    const raw = png([chunk('eXIf', 'GPS 6.45N'), chunk('tEXt', 'Author\0Ada'), chunk('iTXt', 'XMP')]);
    const text = cleanCover(raw).data.toString('latin1');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('Ada');
    expect(text).toContain('IHDR');
    expect(text).toContain('IDAT');
    expect(text).toContain('IEND');
  });

  it('refuses empty, oversized, unknown and damaged files', () => {
    expect(() => cleanCover(undefined)).toThrow('Choose a picture');
    expect(() => cleanCover(Buffer.alloc(COVER_MAX_BYTES + 1, 0xff))).toThrow('2 MB');
    expect(() => cleanCover(Buffer.from('hello world'))).toThrow('JPEG or PNG');
    const cut = jpeg().subarray(0, 10);
    expect(() => cleanCover(cut)).toThrow(BadRequestException);
    expect(() => cleanCover(png().subarray(0, 20))).toThrow('damaged');
  });
});

describe('event phase', () => {
  const at = (iso: string) => new Date(iso).getTime();
  const e = { status: 'published', starts_at: '2026-12-10T17:00:00Z', ends_at: '2026-12-10T19:00:00Z' };

  it('is upcoming, then live, then ended', () => {
    expect(eventPhase(e, at('2026-12-10T16:59:59Z'))).toBe('upcoming');
    expect(eventPhase(e, at('2026-12-10T17:00:00Z'))).toBe('live');
    expect(eventPhase(e, at('2026-12-10T18:59:59Z'))).toBe('live');
    expect(eventPhase(e, at('2026-12-10T19:00:00Z'))).toBe('ended');
  });

  it('shows cancelled whatever the time', () => {
    expect(eventPhase({ ...e, status: 'cancelled' }, at('2026-12-10T18:00:00Z'))).toBe('cancelled');
  });
});
