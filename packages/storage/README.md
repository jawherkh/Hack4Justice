# @hack4justice/storage

Thin S3 client (`@aws-sdk/client-s3`) for object storage. MinIO locally, any S3-compatible service in production.

```ts
import { createStorage } from "@hack4justice/storage";

const storage = createStorage({
  endpoint: process.env.S3_ENDPOINT!,
  region: process.env.S3_REGION!,
  accessKeyId: process.env.S3_ACCESS_KEY_ID!,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  bucket: process.env.S3_BUCKET!,
});

await storage.put({ key: "users/1/doc.pdf", body: bytes, contentType: "application/pdf" });
const url = await storage.presignGet("users/1/doc.pdf");
```

Local MinIO: `docker compose up -d minio` (API on :9000, console on :9001, `minioadmin` / `minioadmin`). The `minio-init` service creates the `hack4justice` bucket.
