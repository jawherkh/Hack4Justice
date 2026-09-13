import { PersistentRepository } from "../src/dossiers/persistent";
import { FileStore } from "../src/dossiers/files";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL before initializing storage");
const repository = new PersistentRepository(
  url,
  new FileStore(process.env.DOCUMENT_STORAGE_DIR ?? ".local-data/documents"),
);
try {
  await repository.initialize(process.argv.includes("--seed-demo"));
  console.log("Storage initialized. Existing records were preserved.");
} catch {
  console.error("Storage initialization failed. Check database access and schema permissions.");
  process.exitCode = 1;
} finally {
  await repository.close();
}
