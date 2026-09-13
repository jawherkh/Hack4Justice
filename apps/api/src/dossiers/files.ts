import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AccessError } from "../access/policy";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export class FileStore {
  constructor(readonly root: string) {}
  private path(id: string) {
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id))
      throw new AccessError(400, "invalid_file_reference");
    return resolve(this.root, id);
  }
  async put(id: string, bytes: Uint8Array) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.path(id), bytes, { flag: "wx" });
  }
  async read(id: string, expectedHash: string) {
    const bytes = await readFile(this.path(id));
    if (checksum(bytes) !== expectedHash) throw new AccessError(500, "file_integrity_failure");
    return bytes;
  }
}

export function inspectFile(bytes: Uint8Array, claimedType: string) {
  if (!bytes.length) throw new AccessError(422, "empty_file");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AccessError(413, "file_too_large");
  const b = Buffer.from(bytes);
  const detected =
    b.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : b[0] === 255 && b[1] === 216 && b[2] === 255
          ? "image/jpeg"
          : null;
  if (!detected || detected !== claimedType) throw new AccessError(415, "unsupported_file_type");
  return { mimeType: detected, sha256: checksum(bytes) };
}
