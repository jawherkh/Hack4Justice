import { prisma } from "../../lib/db";
import { getStorageClient } from "../../lib/storage";
import { logger } from "../../lib/logger";

export async function compileDossier(params: {
  dossierId: string;
  subjectId: string;
}): Promise<Record<string, unknown>> {
  // TODO: replace with real dossier compilation logic
  logger.info(params, "Compiling dossier");
  const subject = await prisma.subject.findFirstOrThrow({
    where: { id: params.subjectId },
  });
  return { dossierId: params.dossierId, subject };
}

export async function exportDossier(params: {
  dossierId: string;
  compiledData: Record<string, unknown>;
}): Promise<{ exportUrl: string }> {
  const bucket = process.env.MINIO_BUCKET_DOCUMENTS ?? "documents";
  const key = `dossiers/${params.dossierId}/export.json`;
  const content = Buffer.from(JSON.stringify(params.compiledData, null, 2));

  await getStorageClient().putObject(bucket, key, content, content.length, {
    "Content-Type": "application/json",
  });

  const exportUrl = `s3://${bucket}/${key}`;
  logger.info({ exportUrl }, "Dossier exported to storage");
  return { exportUrl };
}
