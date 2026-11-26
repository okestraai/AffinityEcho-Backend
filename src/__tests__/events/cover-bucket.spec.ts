const made: any[] = [];
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((config) => {
    made.push(config);
    return { send: jest.fn() };
  }),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

import { coverBucketFrom } from '../../modules/events/cover-bucket';

describe('cover bucket client', () => {
  const config = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as any;
  const all = {
    COVER_BUCKET_NAME: 'covers',
    COVER_BUCKET_ENDPOINT: 'https://r2.example.com',
    COVER_BUCKET_ACCESS_KEY_ID: 'id',
    COVER_BUCKET_SECRET_ACCESS_KEY: 'secret',
  };

  beforeEach(() => (made.length = 0));

  it('gives up on a frozen bucket within seconds instead of holding picture requests open', () => {
    coverBucketFrom(config(all));
    const c = made[0];
    // Without throwOnRequestTimeout the client only logs a warning and keeps waiting.
    expect(c.requestHandler).toEqual(expect.objectContaining({ throwOnRequestTimeout: true }));
    expect(c.requestHandler.requestTimeout).toBeLessThanOrEqual(5_000);
    expect(c.maxAttempts).toBe(2);
  });

  it('is off unless all four settings are present', () => {
    expect(coverBucketFrom(config({ ...all, COVER_BUCKET_ENDPOINT: '' }))).toBeNull();
    expect(made).toHaveLength(0);
  });
});
