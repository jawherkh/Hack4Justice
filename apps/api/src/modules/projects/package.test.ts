import { describe, expect, test } from "vitest";
import type { SubmissionSnapshot } from "@hack4justice/db";

import { assemblePackage, changedSince, type PackageInput, type PackageRequirement } from "./package";

const document = (id: string, filename: string) => ({
  id,
  filename,
  contentType: "application/pdf",
  size: 1024,
  uploadedAt: "2026-09-13T10:00:00.000Z",
});

const requirement = (overrides: Partial<PackageRequirement> & { requirementId: string }): PackageRequirement => ({
  status: "VALID",
  value: null,
  note: null,
  document: null,
  ...overrides,
});

const input = (overrides: Partial<PackageInput> = {}): PackageInput => ({
  project: { id: "project-1", name: "Immatriculation", destination: "RNE", serviceId: "RNE_REGISTRATION" },
  status: "READY_FOR_SUBMISSION",
  requirements: [
    requirement({ requirementId: "VALIDATED_STATUTES", document: document("upload-1", "statuts.pdf") }),
    requirement({ requirementId: "MANAGER_BENEFICIARY_DATA", value: { manager: "confirmed" } }),
    requirement({ requirementId: "FISCAL_IDENTIFIER", value: { matricule: "MATRICULE-PLACEHOLDER" } }),
  ],
  submissions: [],
  assembledAt: new Date("2026-09-13T12:00:00.000Z"),
  ...overrides,
});

describe("assembling a package", () => {
  test("carries the catalogue entry behind each requirement, not only its status", () => {
    const assembled = assemblePackage(input());
    const statutes = assembled.items.find((item) => item.requirementId === "VALIDATED_STATUTES")!;

    // A reviewer checks the requirement against the rule, so the package says which body
    // issues it and whether an official source states it at all.
    expect(statutes.source).toEqual({
      entity: "APII",
      service: "APII_COMPANY_CONSTITUTION",
      status: "SUPPORTED_BY_SOURCE",
      requiredWhen: null,
      notes: null,
    });
    expect(statutes.document).toEqual(document("upload-1", "statuts.pdf"));
    expect(statutes.required).toBe(true);
    expect(statutes.type).toBe("document");
  });

  test("carries how the procedure is filed and what a refusal costs", () => {
    const assembled = assemblePackage(input());
    expect(assembled.service.submissionMode).toBe("100%_ONLINE");
    expect(assembled.service.outputs).toContain("RNE_IDENTIFIER");
    expect(assembled.service.rejectionEffects.length).toBeGreaterThan(0);
  });

  test("names the required items that are still outstanding", () => {
    const assembled = assemblePackage(input({
      status: "IN_PROGRESS",
      requirements: [
        requirement({ requirementId: "VALIDATED_STATUTES", status: "MISSING" }),
        requirement({ requirementId: "MANAGER_BENEFICIARY_DATA", status: "PROVIDED" }),
        requirement({ requirementId: "FISCAL_IDENTIFIER", status: "VALID" }),
      ],
    }));

    // Provided but not yet checked still blocks: it is not evidence a reviewer can accept.
    expect(assembled.missing).toEqual(["VALIDATED_STATUTES", "MANAGER_BENEFICIARY_DATA"]);
  });

  test("a waived optional item does not block, and a complete file has nothing missing", () => {
    const assembled = assemblePackage(input());
    expect(assembled.missing).toEqual([]);
    expect(assembled.status).toBe("READY_FOR_SUBMISSION");
  });

  test("flags a requirement the published source does not state", () => {
    const assembled = assemblePackage(input({
      requirements: [requirement({ requirementId: "NOT_IN_THE_CATALOGUE" })],
    }));
    // Unknown to the catalogue: shown as unsupported rather than presented as settled law.
    expect(assembled.items[0]!.source.status).toBe("NOT_SPECIFIED_IN_SOURCE");
    expect(assembled.items[0]!.required).toBe(false);
  });

  test("refuses to assemble a package for a service that does not exist", () => {
    expect(() => assemblePackage(input({
      project: { id: "project-1", name: "x", destination: "RNE", serviceId: "NOPE" },
    }))).toThrow(/unknown service/);
  });
});

const snapshot = (requirements: SubmissionSnapshot["requirements"]): SubmissionSnapshot => ({
  serviceId: "RNE_REGISTRATION",
  requirements,
});

describe("what changed since the previous submission", () => {
  test("reports a replaced file, a corrected value and a new status", () => {
    const before = snapshot([
      { requirementId: "VALIDATED_STATUTES", status: "INVALID", upload: { id: "upload-1", filename: "old.pdf" }, value: null, note: null },
      { requirementId: "MANAGER_BENEFICIARY_DATA", status: "VALID", upload: null, value: { manager: "Amine" }, note: null },
      { requirementId: "FISCAL_IDENTIFIER", status: "VALID", upload: null, value: null, note: null },
    ]);
    const after = snapshot([
      { requirementId: "VALIDATED_STATUTES", status: "VALID", upload: { id: "upload-2", filename: "new.pdf" }, value: null, note: null },
      { requirementId: "MANAGER_BENEFICIARY_DATA", status: "VALID", upload: null, value: { manager: "Amine Ben Salah" }, note: null },
      { requirementId: "FISCAL_IDENTIFIER", status: "VALID", upload: null, value: null, note: null },
    ]);

    const changes = changedSince(before, after);
    expect(changes.map((change) => change.requirementId)).toEqual(["VALIDATED_STATUTES", "MANAGER_BENEFICIARY_DATA"]);

    const statutes = changes[0]!;
    expect(statutes).toMatchObject({
      previousStatus: "INVALID", status: "VALID",
      documentChanged: true, previousDocument: "upload-1", document: "upload-2",
    });
    // The value was corrected without the file or the status moving; it still counts.
    expect(changes[1]).toMatchObject({ requirementId: "MANAGER_BENEFICIARY_DATA", documentChanged: false });
  });

  test("an unchanged resubmission reports nothing changed", () => {
    const same = snapshot([
      { requirementId: "FISCAL_IDENTIFIER", status: "VALID", upload: null, value: { matricule: "MATRICULE-PLACEHOLDER" }, note: null },
    ]);
    expect(changedSince(same, structuredClone(same))).toEqual([]);
  });

  test("reports a requirement that appeared or disappeared between submissions", () => {
    const before = snapshot([
      { requirementId: "FISCAL_IDENTIFIER", status: "VALID", upload: null, value: null, note: null },
    ]);
    const after = snapshot([
      { requirementId: "FISCAL_IDENTIFIER", status: "VALID", upload: null, value: null, note: null },
      { requirementId: "VALIDATED_STATUTES", status: "VALID", upload: { id: "upload-3", filename: "s.pdf" }, value: null, note: null },
    ]);

    const added = changedSince(before, after);
    expect(added).toEqual([{
      requirementId: "VALIDATED_STATUTES",
      previousStatus: null, status: "VALID",
      documentChanged: true, previousDocument: null, document: "upload-3",
    }]);

    const removed = changedSince(after, before);
    expect(removed).toEqual([{
      requirementId: "VALIDATED_STATUTES",
      previousStatus: "VALID", status: null,
      documentChanged: true, previousDocument: "upload-3", document: null,
    }]);
  });
});
