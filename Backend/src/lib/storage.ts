import * as Minio from "minio";
import { logger } from "../../Backend/src/lib/logger";

let _client: Minio.Client | undefined;

export function getStorageClient(): Minio.Client {
  if (!_client) {
    _client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ROOT_USER ?? "",
      secretKey: process.env.MINIO_ROOT_PASSWORD ?? "",
    });
  }
  return _client;
}

/**
 * Lightweight connectivity check — used by the readiness probe.
 */
export async function checkMinio(): Promise<void> {
  const bucket =
    process.env.MINIO_BUCKET_DOCUMENTS ?? "documents";
  await getStorageClient().bucketExists(bucket);
  logger.debug("minio: ok");
}

/**
 * Ensure required buckets exist (idempotent).
 */
export async function ensureBuckets(): Promise<void> {
  const client = getStorageClient();
  const buckets = [
    process.env.MINIO_BUCKET_DOCUMENTS ?? "documents",
    process.env.MINIO_BUCKET_SANDBOX ?? "sandbox-artifacts",
  ];

  for (const bucket of buckets) {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket, "us-east-1");
      logger.info({ bucket }, "Created MinIO bucket");
    } else {
      logger.debug({ bucket }, "MinIO bucket already exists");
    }
  }
}
