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

// Removes camera and location data (EXIF, XMP, comments) so a photo can't reveal where it was taken.
export function stripJpeg(data: Buffer): Buffer {
  const parts: Buffer[] = [data.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= data.length) {
    if (data[i] !== 0xff)
      throw new BadRequestException('That image file is damaged');
    const marker = data[i + 1];
    // Start of scan: the rest is image data.
    if (marker === 0xda) {
      parts.push(data.subarray(i));
      return Buffer.concat(parts);
    }
    if (marker === 0xd9) break;
    const length = data.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > data.length)
      throw new BadRequestException('That image file is damaged');
    const segment = data.subarray(i, i + 2 + length);
    // APP1 to APP15 and comments hold metadata; APP0 (JFIF) and the image tables stay.
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) parts.push(segment);
    i += 2 + length;
  }
  throw new BadRequestException('That image file is damaged');
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
