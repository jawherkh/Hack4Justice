/**
 * Prisma seed script
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Demo subject
  const subject = await prisma.subject.upsert({
    where: { id: "seed-subject-001" },
    update: {},
    create: {
      id: "seed-subject-001",
      name: "Demo Subject",
    },
  });

  // Demo dossier
  await prisma.dossier.upsert({
    where: { id: "seed-dossier-001" },
    update: {},
    create: {
      id: "seed-dossier-001",
      subjectId: subject.id,
      status: "DRAFT",
    },
  });

  // Demo document record
  await prisma.document.upsert({
    where: { id: "seed-doc-001" },
    update: {},
    create: {
      id: "seed-doc-001",
      storageKey: "documents/seed/demo.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      graphNodeId: "seed-subject-001",
    },
  });

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
