export const UploadStatus = {
  UPLOADED: "UPLOADED",
  PROCESSING: "PROCESSING",
  EXTRACTED: "EXTRACTED",
  FAILED: "FAILED",
} as const;

export type UploadStatus = (typeof UploadStatus)[keyof typeof UploadStatus];

/** Tuple form for enum definitions (Drizzle `pgEnum`, zod `enum`). */
export const UPLOAD_STATUSES = Object.values(UploadStatus) as [UploadStatus, ...UploadStatus[]];
