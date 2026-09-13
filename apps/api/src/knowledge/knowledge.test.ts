import { describe, expect, test, vi } from "vitest";
import { RunContext, invokeFunctionTool } from "@openai/agents";

import { createDemoRepository } from "../access/fixtures";
import { searchLegalKnowledgeTool } from "../agent/tools";
import type { JobReceipt, JobRequest, JobStore } from "../jobs/contracts";
import { withDurableSearches } from "./durable";
import { KnowledgeError, createKnowledgeSearch, type KnowledgeSearch, type LegalContext } from "./search";

class MemoryJobStore implements JobStore {
  readonly receipts: JobReceipt[] = [];

  async findReceipt(jobId: string) {
    const found = this.receipts.find((receipt) => receipt.jobId === jobId);
    return found ? { ...found } : undefined;
  }

  async claim(request: JobRequest, startedAt: string) {
    if (this.receipts.some((receipt) => receipt.jobId === request.jobId)) throw new Error("duplicate job id");
    const receipt: JobReceipt = {
      jobId: request.jobId, dossierId: request.dossierId, kind: request.kind,
      status: "running", attempts: 1, startedAt, updatedAt: startedAt,
    };
    this.receipts.push(receipt);
    return { ...receipt };
  }

  async complete(jobId: string, outcome: Pick<JobReceipt, "status" | "output" | "error" | "retryable">) {
    const receipt = this.receipts.find((candidate) => candidate.jobId === jobId)!;
    Object.assign(receipt, outcome, { updatedAt: new Date().toISOString() });
    return { ...receipt };
  }

  async reattempt(jobId: string, expectedAttempts: number) {
    const receipt = this.receipts.find((candidate) => candidate.jobId === jobId);
    if (!receipt || receipt.attempts !== expectedAttempts) return undefined;
    receipt.attempts += 1;
    receipt.status = "running";
    return { ...receipt };
  }

  async abandoned(olderThan: string) {
    return this.receipts.filter((receipt) => receipt.status === "running" && receipt.updatedAt < olderThan);
  }
}

/** One edge with the episode it was extracted from, shaped as the service returns it. */
const serviceBody = {
  agency: "DGI",
  group_id: "dgi",
  query: "attestation",
  edges: [{
    uuid: "edge-1",
    name: "REQUIRES",
    fact: "Le dossier exige une attestation de situation fiscale.",
    valid_at: "2024-01-01T00:00:00Z",
    invalid_at: null,
    episodes: ["episode-1"],
  }],
  nodes: [],
  episodes: [{
    uuid: "episode-1",
    name: "code-tva-art-12",
    group_id: "dgi",
    source: "text",
    source_description: "Code de la TVA, article 12",
    content_excerpt: "Attestation exigee avant le depot.",
  }],
};

function respondWith(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("legal knowledge search", () => {
  test("asks the service for one agency and returns citable passages", async () => {
    const fetcher = respondWith(serviceBody);
    vi.stubGlobal("fetch", fetcher);
    try {
      const context = await createKnowledgeSearch("http://knowledge.test").search({ agency: "DGI", query: "  attestation  " });

      const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("http://knowledge.test/api/v1/knowledge/search");
      // The service partitions by this header and rejects an unknown one.
      expect((init.headers as Record<string, string>)["X-Agency-Code"]).toBe("DGI");
      // The service forbids unknown fields, so the body must keep its own spelling.
      expect(JSON.parse(String(init.body))).toEqual({ query: "attestation", max_results: 10 });

      expect(context.needsReview).toBe(false);
      // The reference is the document, not the extracted relation: that is what a person
      // can go and read.
      expect(context.passages).toEqual([{
        fact: "Le dossier exige une attestation de situation fiscale.",
        source: "Code de la TVA, article 12",
        reference: "episode-1",
        statement: "edge-1",
        validFrom: "2024-01-01T00:00:00Z",
        excerpt: "Attestation exigee avant le depot.",
      }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("reports nothing found as needing review rather than as an answer", async () => {
    vi.stubGlobal("fetch", respondWith({ ...serviceBody, edges: [], episodes: [] }));
    try {
      const context = await createKnowledgeSearch("http://knowledge.test").search({ agency: "RNE", query: "inconnu" });
      expect(context.passages).toEqual([]);
      expect(context.needsReview).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("refuses to present a statement with no document behind it", async () => {
    // The shape the service returns when it matched a relation but attached no episode.
    // Its relation name is not a source, and an answer citing it could not be checked.
    vi.stubGlobal("fetch", respondWith({
      agency: "DGI", group_id: "dgi", query: "quittance",
      edges: [{ uuid: "edge-1", name: "REQUIRES", fact: "A quittance fiscale is required.", episodes: [], attributes: {} }],
      nodes: [], episodes: [],
    }));
    try {
      const context = await createKnowledgeSearch("http://knowledge.test").search({ agency: "DGI", query: "quittance" });
      expect(context.passages).toEqual([]);
      expect(context.unsourcedStatements).toBe(1);
      expect(context.needsReview).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("keeps matching legal text that no relation was extracted from", async () => {
    vi.stubGlobal("fetch", respondWith({ ...serviceBody, edges: [] }));
    try {
      const context = await createKnowledgeSearch("http://knowledge.test").search({ agency: "DGI", query: "attestation" });
      // The episode is the document itself. Reporting it as nothing found would hide law
      // the service did return.
      expect(context.needsReview).toBe(false);
      expect(context.passages).toEqual([{
        fact: "Attestation exigee avant le depot.",
        source: "Code de la TVA, article 12",
        reference: "episode-1",
        excerpt: "Attestation exigee avant le depot.",
      }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("separates a service that is briefly down from one that refused the request", async () => {
    vi.stubGlobal("fetch", respondWith({ detail: "graph not ready" }, 503));
    try {
      await expect(createKnowledgeSearch("http://knowledge.test").search({ agency: "DGI", query: "q" }))
        .rejects.toMatchObject({ temporary: true });
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal("fetch", respondWith({ detail: "unknown agency" }, 400));
    try {
      await expect(createKnowledgeSearch("http://knowledge.test").search({ agency: "DGI", query: "q" }))
        .rejects.toMatchObject({ temporary: false });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("treats an unreachable service as worth another attempt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    try {
      const failure = await createKnowledgeSearch("http://knowledge.test")
        .search({ agency: "DGI", query: "q" }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(KnowledgeError);
      expect((failure as KnowledgeError).temporary).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

const found = (agency: string): LegalContext => ({
  agency: agency as LegalContext["agency"],
  query: "attestation",
  passages: [{ fact: "une attestation est exigee", source: "Code de la TVA, article 12", reference: "episode-1" }],
  unsourcedStatements: 0,
  needsReview: false,
});

describe("durable legal lookups", () => {
  test("asks the graph once for a question repeated in the same conversation", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const search: KnowledgeSearch = { async search({ agency }) { calls += 1; return found(agency); } };
    const durable = withDurableSearches(search, store, { dossierId: "dossier-1", sessionId: "session-1" });

    const first = await durable.search({ agency: "DGI", query: "attestation" });
    const again = await durable.search({ agency: "DGI", query: "attestation" });

    expect(calls).toBe(1);
    expect(again).toEqual(first);
    expect(store.receipts).toHaveLength(1);
    expect(store.receipts[0]!.kind).toBe("retrieval");
  });

  test("does not answer one agency from another agency's stored lookup", async () => {
    const store = new MemoryJobStore();
    const asked: string[] = [];
    const search: KnowledgeSearch = { async search({ agency }) { asked.push(agency); return found(agency); } };
    const durable = withDurableSearches(search, store, { dossierId: "dossier-1", sessionId: "session-1" });

    const dgi = await durable.search({ agency: "DGI", query: "attestation" });
    const rne = await durable.search({ agency: "RNE", query: "attestation" });

    // Same wording, different graph: a stored lookup must not be reused across agencies.
    expect(asked).toEqual(["DGI", "RNE"]);
    expect(dgi.agency).toBe("DGI");
    expect(rne.agency).toBe("RNE");
    expect(store.receipts).toHaveLength(2);
  });

  test("tries again after the service was down, and not after it refused", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const flaky: KnowledgeSearch = {
      async search({ agency }) {
        calls += 1;
        if (calls === 1) throw new KnowledgeError("graph not ready", 503);
        return found(agency);
      },
    };
    const durable = withDurableSearches(flaky, store, { dossierId: "dossier-1", sessionId: "session-1" });

    await expect(durable.search({ agency: "DGI", query: "attestation" })).rejects.toThrow();
    expect(await durable.search({ agency: "DGI", query: "attestation" })).toEqual(found("DGI"));
    expect(calls).toBe(2);

    const refusing: KnowledgeSearch = { async search() { calls += 1; throw new KnowledgeError("unknown agency", 400); } };
    const permanent = withDurableSearches(refusing, store, { dossierId: "dossier-1", sessionId: "session-2" });
    await expect(permanent.search({ agency: "DGI", query: "refuse" })).rejects.toThrow();
    await expect(permanent.search({ agency: "DGI", query: "refuse" })).rejects.toThrow();
    // Three: the two calls above, plus one refusal that is not asked a second time.
    expect(calls).toBe(3);
  });
});

async function invoke(context: Record<string, unknown>, input: unknown): Promise<unknown> {
  return await invokeFunctionTool({ tool: searchLegalKnowledgeTool, runContext: new RunContext(context), input: JSON.stringify(input) });
}

const member = { id: "demo-member-alpha", roles: ["business_member"] as const, companyIds: ["company-alpha"] };

describe("the agent's legal source tool", () => {
  test("searches the dossier's own agency, whatever the model asks for", async () => {
    const repository = createDemoRepository();
    const session = await repository.createAgentSession({ dossierId: "dossier-alpha-dgi", principalId: member.id });
    const asked: string[] = [];
    const knowledge: KnowledgeSearch = { async search({ agency }) { asked.push(agency); return found(agency); } };

    // The dossier belongs to one agency. The question names a different one on purpose.
    const result = await invoke(
      { repository, principal: member, dossierId: "dossier-alpha-dgi", sessionId: session.id, knowledge },
      { query: "registry requirements held by another agency for this company" },
    ) as LegalContext;

    expect(asked).toEqual(["DGI"]);
    expect(result.agency).toBe("DGI");
  });

  test("reports a lookup it could not run as needing review", async () => {
    const repository = createDemoRepository();
    const session = await repository.createAgentSession({ dossierId: "dossier-alpha-dgi", principalId: member.id });
    const broken: KnowledgeSearch = { async search() { throw new KnowledgeError("knowledge_unreachable"); } };

    const result = await invoke(
      { repository, principal: member, dossierId: "dossier-alpha-dgi", sessionId: session.id, knowledge: broken },
      { query: "quelles pieces" },
    ) as LegalContext & { reason?: string };

    // Not an absence of rules: the model must not fill the gap from its own memory.
    expect(result.needsReview).toBe(true);
    expect(result.passages).toEqual([]);
    expect(result.reason).toBe("knowledge_unreachable");
  });

  test("reports needing review when no knowledge source is configured", async () => {
    const repository = createDemoRepository();
    const session = await repository.createAgentSession({ dossierId: "dossier-alpha-dgi", principalId: member.id });

    const result = await invoke(
      { repository, principal: member, dossierId: "dossier-alpha-dgi", sessionId: session.id },
      { query: "quelles pieces" },
    ) as LegalContext & { reason?: string };

    expect(result.needsReview).toBe(true);
    expect(result.reason).toBe("knowledge_source_unavailable");
  });
});
