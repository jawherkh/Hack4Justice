/**
 * Seeds the first superadmin for the admin panel.
 *
 *   pnpm --filter @hack4justice/db db:seed
 *
 * Reads SEED_SUPERADMIN_EMAIL / _PASSWORD / _NAME from the root .env. Idempotent:
 * an existing account with that email is left untouched (role is promoted).
 */
import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { seed } from "drizzle-seed";

import { closeDb, createDb } from "../src/client";
import { adminAccount, adminUser } from "../src/schema/admin";

config({ path: "../../.env", quiet: true });

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL is not set");
const email = (process.env["SEED_SUPERADMIN_EMAIL"] ?? "admin@dalil.local").toLowerCase();
const password = process.env["SEED_SUPERADMIN_PASSWORD"] ?? "change-me-now-12";
const name = process.env["SEED_SUPERADMIN_NAME"] ?? "Super Admin";
if (password.length < 10) throw new Error("SEED_SUPERADMIN_PASSWORD must be at least 10 characters");

const db = createDb(url, { max: 1 });
try {
  const [existing] = await db.select().from(adminUser).where(eq(adminUser.email, email)).limit(1);
  if (existing) {
    if (existing.role !== "superadmin") {
      await db.update(adminUser).set({ role: "superadmin" }).where(eq(adminUser.id, existing.id));
      console.log(`Promoted ${email} to superadmin`);
    } else {
      console.log(`Superadmin ${email} already exists, nothing to do`);
    }
  } else {
    // drizzle-seed generates the row; the refinement pins the columns that matter.
    await seed(db, { adminUser }).refine((f) => ({
      adminUser: {
        count: 1,
        columns: {
          // drizzle-seed's own uuid generator is not RFC 4122; pin a real one.
          id: f.default({ defaultValue: randomUUID() }),
          createdAt: f.default({ defaultValue: new Date() }),
          updatedAt: f.default({ defaultValue: new Date() }),
          name: f.valuesFromArray({ values: [name] }),
          email: f.valuesFromArray({ values: [email] }),
          emailVerified: f.valuesFromArray({ values: [true] }),
          role: f.valuesFromArray({ values: ["superadmin"] }),
          image: f.default({ defaultValue: null }),
        },
      },
    }));
    const [created] = await db.select().from(adminUser).where(eq(adminUser.email, email)).limit(1);
    if (!created) throw new Error("seed did not create the superadmin");
    // Credential account in Better Auth's format so the admin panel login works.
    await db.insert(adminAccount).values({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await hashPassword(password),
      updatedAt: new Date(),
    });
    console.log(`Created superadmin ${email}`);
  }
} finally {
  await closeDb(db);
}
