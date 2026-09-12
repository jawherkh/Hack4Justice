import { z } from "zod";

const id = z.string().min(1).max(200);
export const lifecycleCommandBody = z.strictObject({
  type: z.enum(["evidence_changed", "review_requested", "submission_requested", "resubmission_requested", "cancellation_requested", "decision_recorded"]),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: id,
  nodeId: id.optional(),
  correlationId: id.optional(),
  confirmed: z.boolean().optional(),
  decision: z.strictObject({
    action: z.enum(["accept", "refuse", "request_modification"]),
    reason: z.string().trim().min(1).max(2000),
    targetNodeIds: z.array(id).max(100).default([]),
    evidenceIds: z.array(id).max(100).default([]),
  }).optional(),
}).superRefine((command, context) => {
  if ((command.type === "decision_recorded") !== Boolean(command.decision)) context.addIssue({ code: "custom", message: "Decision payload does not match command" });
  if (command.type === "decision_recorded" && !command.nodeId) context.addIssue({ code: "custom", message: "A review node is required" });
});

export const prerequisiteBody = z.strictObject({
  obligationId: id, version: z.number().int().positive(),
  status: z.enum(["fulfilled", "unfulfilled", "unknown", "disputed"]),
  ruleVersionId: id, sourceRef: id, expiresAt: z.iso.datetime({ offset: true }),
  actions: z.array(z.enum(["submission_requested", "resubmission_requested"])).min(1).max(2),
});
