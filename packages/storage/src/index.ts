import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageOptions {
  /** S3 endpoint, e.g. http://localhost:9000 for MinIO. */
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Required for MinIO and most self-hosted S3. Defaults to true. */
  forcePathStyle?: boolean;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array | Buffer | string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface ObjectInfo {
  key: string;
  size: number;
  contentType: string | undefined;
  lastModified: Date | undefined;
}

export type Storage = ReturnType<typeof createStorage>;

/** S3-compatible object storage client. Works with MinIO locally and AWS S3 in production. */
export function createStorage(options: StorageOptions) {
  const bucket = options.bucket;
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: options.forcePathStyle ?? true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  return {
    bucket,
    client,

    async put({ key, body, contentType, metadata }: PutObjectInput): Promise<void> {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, Metadata: metadata }),
      );
    },

    async get(key: string): Promise<Uint8Array> {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!res.Body) throw new Error(`Empty body for object ${key}`);
      return res.Body.transformToByteArray();
    },

    async head(key: string): Promise<ObjectInfo> {
      const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { key, size: res.ContentLength ?? 0, contentType: res.ContentType, lastModified: res.LastModified };
    },

    async delete(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    /** Presigned download URL. `expiresIn` in seconds, default 15 minutes. */
    presignGet(key: string, expiresIn = 15 * 60): Promise<string> {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
    },

    /** Presigned upload URL for direct browser uploads. */
    presignPut(key: string, contentType: string, expiresIn = 15 * 60): Promise<string> {
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
        { expiresIn },
      );
    },
  };
}
