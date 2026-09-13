import { createHash } from "node:crypto";

import { type JobStore } from "../jobs/contracts";
import { RetryableJobError, runJob } from "../jobs/runner";
import { KnowledgeError, type KnowledgeSearch, type KnowledgeSearchInput, type LegalContext } from "./search";

export interface DurableSearchOptions {
  dossierId: string;
  /**
   * Scopes the stored lookup. A repeat of the same question in the same conversation is
   * answered from the record; the next conversation reads the graph again, so ingested
   * changes are picked up. If a long conversation must see an ingestion made halfway
   * through it, narrow this to the turn.
   */
  sessionId: string;
}

/**
 * Wraps a knowledge lookup so one question is asked of the graph once.
 *
 * The search itself is unchanged. Without this, a turn that fails after the lookup
 * succeeded runs the lookup again on the retry, paying for the same embeddings and
 * reranking a second time to receive the same passages.
 */
export function withDurableSearches(
  search: KnowledgeSearch,
  store: JobStore,
  options: DurableSearchOptions,
): KnowledgeSearch {
  return {
    async search(input: KnowledgeSearchInput): Promise<LegalContext> {
      const jobId = searchJobId(options.sessionId, input);

      const receipt = await runJob(
        store,
        { jobId, dossierId: options.dossierId, kind: "retrieval" },
        async ({ heartbeat }) => {
          heartbeat({ jobId, phase: "searching", agency: input.agency });
          try {
            return { output: { ...(await search.search(input)) } };
          } catch (error) {
            if (error instanceof KnowledgeError && error.temporary) {
              throw new RetryableJobError(error.message);
            }
            throw error;
          }
        },
        { ...(input.signal ? { signal: input.signal } : {}) },
      );

      if (receipt.status === "succeeded" && receipt.output) return receipt.output as unknown as LegalContext;
      throw new KnowledgeError(receipt.error ?? "knowledge_search_failed", receipt.retryable ? 503 : 422);
    },
  };
}

/**
 * Identifies one question. The agency is part of it so the same wording asked for two
 * agencies cannot be answered from the other agency's graph.
 */
function searchJobId(sessionId: string, input: KnowledgeSearchInput): string {
  const question = createHash("sha256")
    .update(`${input.agency}\n${input.query.trim()}`)
    .digest("hex")
    .slice(0, 16);
  return `retrieval:${sessionId}:${question}`;
}
