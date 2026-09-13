import { user, userProfile, type NewUserProfile, type UserProfile } from "@hack4justice/db";
import {
  ACCOUNT_TYPES,
  AppError,
  COMPANY_NAME_MAX_LENGTH,
  COMPANY_STAGES,
  GOVERNORATES,
  LEGAL_FORMS,
  PHONE_PATTERN,
  PROFILE_NAME_MAX_LENGTH,
  SUPPORTED_LOCALES,
  TAX_ID_PATTERN,
  normalizePhone,
  normalizeTaxId,
  AccountType,
} from "@hack4justice/shared";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { authGuard } from "../../auth";
import { db } from "../../db";

const nameSchema = t.String({ minLength: 1, maxLength: PROFILE_NAME_MAX_LENGTH });
// Optional enums are validated by hand: Elysia fills absent `t.Optional(t.UnionEnum())`
// with the first member instead of leaving it undefined.
const optionalText = (maxLength: number) => t.Optional(t.String({ maxLength }));

const bodySchema = t.Object({
  firstName: nameSchema,
  lastName: nameSchema,
  accountType: t.UnionEnum(ACCOUNT_TYPES),
  preferredLocale: t.UnionEnum(SUPPORTED_LOCALES),
  governorate: optionalText(32),
  phone: optionalText(32),
  companyName: optionalText(COMPANY_NAME_MAX_LENGTH),
  legalForm: optionalText(16),
  companyStage: optionalText(16),
  taxId: optionalText(32),
  acceptTerms: t.Boolean(),
});

type ProfileBody = typeof bodySchema.static;

export const profileModule = new Elysia({ prefix: "/me/profile", tags: ["profile"] })
  .use(authGuard)

  .get(
    "/",
    async ({ user: me }) => {
      const [row] = await db.select().from(userProfile).where(eq(userProfile.userId, me.id)).limit(1);
      return toView(row ?? null);
    },
    { auth: true, detail: { summary: "My onboarding profile, or null before onboarding" } },
  )

  .put(
    "/",
    async ({ body, user: me, set }) => {
      const { acceptedTermsAt, userId, ...values } = toValues(body, me.id);
      const [existing] = await db
        .select({ userId: userProfile.userId })
        .from(userProfile)
        .where(eq(userProfile.userId, me.id))
        .limit(1);
      const row = await db.transaction(async (tx) => {
        const [saved] = existing
          ? // Terms were accepted once at onboarding; edits keep that timestamp.
            await tx.update(userProfile).set(values).where(eq(userProfile.userId, me.id)).returning()
          : await tx
              .insert(userProfile)
              .values({ ...values, userId, acceptedTermsAt })
              .returning();
        if (!saved) throw new AppError({ status: 500, code: "internal_error" });
        // Keep the display name Better Auth shows in sync with the profile.
        await tx
          .update(user)
          .set({ name: `${saved.firstName} ${saved.lastName}` })
          .where(eq(user.id, me.id));
        return saved;
      });
      set.status = existing ? 200 : 201;
      return toView(row);
    },
    {
      auth: true,
      body: bodySchema,
      detail: { summary: "Complete onboarding or update my profile" },
    },
  );

function toValues(body: ProfileBody, userId: string): NewUserProfile {
  if (!body.acceptTerms) throw new AppError({ status: 422, code: "terms_not_accepted" });
  const companyName = emptyToNull(body.companyName);
  if (body.accountType === AccountType.BUSINESS && !companyName) {
    throw new AppError({ status: 422, code: "company_name_required" });
  }
  const taxId = body.taxId?.trim() ? normalizeTaxId(body.taxId) : null;
  if (taxId && !TAX_ID_PATTERN.test(taxId)) throw new AppError({ status: 422, code: "invalid_tax_id" });
  const phone = body.phone?.trim() ? normalizePhone(body.phone) : null;
  if (phone && !PHONE_PATTERN.test(phone)) throw new AppError({ status: 422, code: "invalid_phone" });

  return {
    userId,
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    accountType: body.accountType,
    preferredLocale: body.preferredLocale,
    governorate: oneOf(GOVERNORATES, body.governorate),
    phone,
    companyName,
    legalForm: oneOf(LEGAL_FORMS, body.legalForm),
    companyStage: oneOf(COMPANY_STAGES, body.companyStage),
    taxId,
    acceptedTermsAt: new Date(),
  };
}

/** Empty or absent means "not set"; anything else must be a known member. */
function oneOf<T extends string>(members: readonly T[], value: string | undefined): T | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!(members as readonly string[]).includes(trimmed)) {
    throw new AppError({ status: 422, code: "validation_error" });
  }
  return trimmed as T;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toView(row: UserProfile | null) {
  if (!row) return null;
  const { createdAt, updatedAt, ...rest } = row;
  void createdAt;
  void updatedAt;
  return rest;
}
