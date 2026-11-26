import { BadRequestException } from '@nestjs/common';

export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export type CoverMime = 'image/jpeg' | 'image/png';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
// PNG chunks that can carry text or camera data; images never need them.
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

// Decides the type from the bytes, never from the name or header the browser sent.
export function coverType(data: Buffer): CoverMime | null {
  if (
    data.length > 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return 'image/jpeg';
  if (data.length > 8 && data.subarray(0, 8).equals(PNG_SIGNATURE))
    return 'image/png';
  return null;
}

const damaged = () => new BadRequestException('That image file is damaged');

// APP1 to APP15 and comments hold metadata. The colour profile (APP2) and Adobe colour data (APP14) stay.
function isJpegMetadata(marker: number, body: Buffer): boolean {
  if (marker === 0xfe) return true;
  if (marker < 0xe1 || marker > 0xef) return false;
  if (
    marker === 0xe2 &&
    body.subarray(0, 12).toString('latin1') === 'ICC_PROFILE\0'
  )
    return false;
  if (marker === 0xee && body.subarray(0, 5).toString('latin1') === 'Adobe')
    return false;
  return true;
}

// Removes camera and location data (EXIF, XMP, comments) so a photo can't reveal where it was taken.
// Everything after the end of the picture is dropped too, which removes any second image glued on.
export function stripJpeg(data: Buffer): Buffer {
  const parts: Buffer[] = [data.subarray(0, 2)];
  let i = 2;
  let inScan = false;
  while (i < data.length) {
    if (inScan) {
      // Image data runs until a real marker; 0xFF00, restart markers and fill bytes are part of it.
      let j = i;
      while (j + 1 < data.length) {
        if (data[j] === 0xff) {
          const next = data[j + 1];
          if (
            next === 0x00 ||
            (next >= 0xd0 && next <= 0xd7) ||
            next === 0xff
          ) {
            j += next === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        j++;
      }
      if (j + 1 >= data.length) throw damaged();
      parts.push(data.subarray(i, j));
      i = j;
      inScan = false;
    }
    if (i + 2 > data.length || data[i] !== 0xff) throw damaged();
    const marker = data[i + 1];
    if (marker === 0xd9) {
      parts.push(data.subarray(i, i + 2));
      return Buffer.concat(parts);
    }
    if (i + 4 > data.length) throw damaged();
    const length = data.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > data.length) throw damaged();
    const body = data.subarray(i + 4, i + 2 + length);
    if (!isJpegMetadata(marker, body))
      parts.push(data.subarray(i, i + 2 + length));
    i += 2 + length;
    if (marker === 0xda) inScan = true;
  }
  throw damaged();
}

export function stripPng(data: Buffer): Buffer {
  const parts: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  while (i + 12 <= data.length) {
    const length = data.readUInt32BE(i);
    const end = i + 12 + length;
    if (end > data.length)
      throw new BadRequestException('That image file is damaged');
    const type = data.subarray(i + 4, i + 8).toString('latin1');
    if (!PNG_DROP.has(type)) parts.push(data.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(parts);
  }
  throw new BadRequestException('That image file is damaged');
}

// Checks an upload and returns it ready to store.
export function cleanCover(data: Buffer | undefined): {
  mime: CoverMime;
  data: Buffer;
} {
  if (!data?.length) throw new BadRequestException('Choose a picture');
  if (data.length > COVER_MAX_BYTES)
    throw new BadRequestException('The picture must be 2 MB or smaller');
  const mime = coverType(data);
  if (!mime) throw new BadRequestException('Use a JPEG or PNG picture');
  return {
    mime,
    data: mime === 'image/jpeg' ? stripJpeg(data) : stripPng(data),
  };
}
