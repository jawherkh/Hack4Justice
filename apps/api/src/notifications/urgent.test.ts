import { describe, expect, test } from "vitest";
import { NOTIFICATION_TYPES, NotificationType, isUrgentNotification } from "@hack4justice/shared";

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
