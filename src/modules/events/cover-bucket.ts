import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';

// An S3-style bucket for cover pictures: Cloudflare R2 or AWS S3. The keys live only in the server's environment.
export interface CoverBucket {
  name: string;
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const BUCKET_KEYS = [
  'COVER_BUCKET_NAME',
  'COVER_BUCKET_ENDPOINT',
  'COVER_BUCKET_ACCESS_KEY_ID',
  'COVER_BUCKET_SECRET_ACCESS_KEY',
] as const;

// What the admin console may see: whether a bucket is set up and its name, never the keys.
export function coverBucketStatus(config: ConfigService) {
  const ready = BUCKET_KEYS.every((k) => !!config.get<string>(k));
  return {
    bucketReady: ready,
    bucketName: ready ? config.get<string>('COVER_BUCKET_NAME')! : null,
  };
}

export function coverBucketFrom(config: ConfigService): CoverBucket | null {
  const name = config.get<string>('COVER_BUCKET_NAME');
  const endpoint = config.get<string>('COVER_BUCKET_ENDPOINT');
  const accessKeyId = config.get<string>('COVER_BUCKET_ACCESS_KEY_ID');
  const secretAccessKey = config.get<string>('COVER_BUCKET_SECRET_ACCESS_KEY');
  if (!name || !endpoint || !accessKeyId || !secretAccessKey) return null;
  const client = new S3Client({
    region: config.get<string>('COVER_BUCKET_REGION') || 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return {
    name,
    async put(key, data, mime) {
      await client.send(
        new PutObjectCommand({
          Bucket: name,
          Key: key,
          Body: data,
          ContentType: mime,
        }),
      );
    },
    async get(key) {
      const out = await client.send(
        new GetObjectCommand({ Bucket: name, Key: key }),
      );
      const bytes = await out.Body!.transformToByteArray();
      return Buffer.from(bytes);
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: name, Key: key }));
    },
  };
}
