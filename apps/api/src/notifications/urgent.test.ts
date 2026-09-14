import { describe, expect, test } from "vitest";
import { NOTIFICATION_TYPES, NotificationType, isUrgentNotification } from "@hack4justice/shared";

import { buildUrgentMessage } from "./messages";

describe("what reaches the user's phone", () => {
  test("a refused submission does, because the user must act before anything moves", () => {
    expect(isUrgentNotification(NotificationType.SUBMISSION_UPDATED, { status: "REJECTED" })).toBe(true);
  });

  test("a document the platform could not read does, for the same reason", () => {
    expect(isUrgentNotification(NotificationType.UPLOAD_FAILED, { filename: "statuts.pdf" })).toBe(true);
  });

  test("an accepted or reviewing submission does not", () => {
    for (const status of ["ACCEPTED", "UNDER_REVIEW", "SUBMITTED"]) {
      expect(isUrgentNotification(NotificationType.SUBMISSION_UPDATED, { status })).toBe(false);
    }
  });

  test("a submission update with no status does not", () => {
    // Nothing says the user is blocked, so nothing is sent.
    expect(isUrgentNotification(NotificationType.SUBMISSION_UPDATED, {})).toBe(false);
  });

  test("progress and good news stay in the inbox", () => {
    const quiet = NOTIFICATION_TYPES.filter(
      (type) => type !== NotificationType.SUBMISSION_UPDATED && type !== NotificationType.UPLOAD_FAILED,
    );
    // A channel that carries everything is muted, and a muted channel does not deliver the
    // one message that mattered.
    for (const type of quiet) expect(isUrgentNotification(type, {})).toBe(false);
    expect(quiet).toContain(NotificationType.PROCEDURE_READY);
    expect(quiet).toContain(NotificationType.UPLOAD_EXTRACTED);
  });

  test("every notification type is decided, so a new one cannot default into messaging people", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(typeof isUrgentNotification(type, {})).toBe("boolean");
    }
    // Only the two blocking cases are ever urgent with an empty payload.
    expect(NOTIFICATION_TYPES.filter((type) => isUrgentNotification(type, {}))).toEqual([
      NotificationType.UPLOAD_FAILED,
    ]);
  });
});

describe("what the message is allowed to contain", () => {
  const longNote = "les statuts enregistres sont illisibles et la page 3 manque. ".repeat(40);

  test("a long reviewer note does not push the title past what a message accepts", () => {
    expect(longNote.length).toBeGreaterThan(2_000 - 1);
    const { title, body } = buildUrgentMessage(
      NotificationType.SUBMISSION_UPDATED,
      { reference: "H4J-20260913-ABCDEF", status: "REJECTED", note: longNote },
      "fr",
    );

    // A message over the limit is rejected outright, so an overlong note used to mean the
    // user was told nothing at all.
    expect(title.length).toBeLessThanOrEqual(200);
    expect(body.length).toBeLessThanOrEqual(4_000);
    expect(title).toContain("H4J-20260913-ABCDEF");
    // The note is not what the title is for. Putting it there is what overran the limit,
    // and clamping it there would only leave a title that is the first line of a note.
    expect(title).not.toContain("les statuts enregistres");
    // What the reviewer wrote is the useful part, so it survives in the body.
    expect(body).toContain("les statuts enregistres sont illisibles");
  });

  test("an overlong filename or project name cannot overrun the title either", () => {
    const { title, body } = buildUrgentMessage(
      NotificationType.UPLOAD_FAILED,
      { project: "P".repeat(500), filename: "f".repeat(500), error: "E".repeat(3_000) },
      "fr",
    );
    expect(title.length).toBeLessThanOrEqual(200);
    expect(body.length).toBeLessThanOrEqual(4_000);
  });

  test("a short note is passed through whole", () => {
    const { body } = buildUrgentMessage(
      NotificationType.SUBMISSION_UPDATED,
      { reference: "H4J-1", status: "REJECTED", note: "il manque l'attestation fiscale" },
      "fr",
    );
    expect(body).toContain("il manque l'attestation fiscale");
  });

  test("the Arabic message is built too, and stays inside the limits", () => {
    const { title, body } = buildUrgentMessage(
      NotificationType.SUBMISSION_UPDATED,
      { reference: "H4J-1", status: "REJECTED", note: longNote },
      "ar-TN",
    );
    expect(title.length).toBeLessThanOrEqual(200);
    expect(body.length).toBeLessThanOrEqual(4_000);
    expect(title).toContain("H4J-1");
  });
});
