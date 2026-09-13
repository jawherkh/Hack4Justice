import { NotificationType, type NotificationType as Type } from "@hack4justice/shared";

import { renderTemplate, type Language } from "./notify";

/** The message record's own limits. A message that exceeds them is rejected and never sent. */
const maxTitle = 200;
const maxBody = 4000;

/** Keeps a value inside a limit without cutting a word in half where it can be helped. */
function clamp(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Builds the message for one urgent notification.
 *
 * Values here come from people and from other systems: a reviewer writes a refusal note of
 * any length, a filename is whatever was uploaded. None of them belong in the title, which
 * is the short line, and all of them are bounded before they reach the record. A message
 * that overruns its limits is not sent at all, which is the one outcome this whole path
 * exists to avoid.
 */
export function buildUrgentMessage(
  type: Type,
  payload: Record<string, string>,
  language: Language,
): { title: string; body: string } {
  const rendered =
    type === NotificationType.SUBMISSION_UPDATED
      ? renderTemplate(language, "decision", {
          dossierReference: clamp(payload.reference ?? payload.project ?? "", 60),
          // Short and fixed, so the title stays a title. What the reviewer wrote is the
          // useful part and goes in the body, where there is room for it.
          subject: language === "ar-TN" ? "تم رفض الملف" : "dossier refuse",
          nextAction: payload.note?.trim()
            ? (language === "ar-TN" ? "تصحيح: " : "corriger : ") + clamp(payload.note.trim(), 1_500)
            : language === "ar-TN"
              ? "فتح الملف وتصحيح الوثائق المشار إليها"
              : "ouvrir le dossier et corriger les pieces signalees",
        })
      : renderTemplate(language, "blocked", {
          dossierReference: clamp(payload.project ?? payload.filename ?? "", 60),
          // What went wrong, then what to do about it. Putting the error in both places
          // leaves a next step that repeats the problem and asks for nothing.
          subject: clamp(
            payload.error?.trim() || (language === "ar-TN" ? "وثيقة غير مقروءة" : "document illisible"),
            1_000,
          ),
          nextAction: payload.filename
            ? language === "ar-TN"
              ? `إعادة تحميل ${clamp(payload.filename, 80)}`
              : `televerser a nouveau ${clamp(payload.filename, 80)}`
            : language === "ar-TN"
              ? "إعادة تحميل الوثيقة"
              : "televerser a nouveau le document",
        });

  return { title: clamp(rendered.title, maxTitle), body: clamp(rendered.body, maxBody) };
}
