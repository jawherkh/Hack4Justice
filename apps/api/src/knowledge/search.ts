import type { Agency } from "../access/policy";

/** One statement the knowledge service found, with what it was drawn from. */
export interface LegalPassage {
  /** What the source says. */
  fact: string;
  /** The document the statement was extracted from, as it should be cited. */
  source: string;
  /**
   * Identifies the stored statement. An answer quoting this passage can be traced back to
   * the exact version that was read, and a later ingestion changes the identifier rather
   * than the meaning of an answer already given.
   */
  reference: string;
  /** The window the statement applies in. A statement with an end date has been replaced. */
  validFrom?: string;
  validUntil?: string;
  /** A short quotation from the document, for a person checking the answer. */
  excerpt?: string;
}

export interface LegalContext {
  agency: Agency;
  query: string;
  passages: LegalPassage[];
  /**
   * No approved source supports an answer. The caller must say so rather than answer from
   * the model's own memory, which is the failure this whole lookup exists to prevent.
   */
  needsReview: boolean;
}

export interface KnowledgeSearchInput {
  /** Taken from the dossier by the caller. Never accepted from model input. */
  agency: Agency;
  query: string;
  maxResults?: number;
  signal?: AbortSignal;
}

export interface KnowledgeSearch {
  search(input: KnowledgeSearchInput): Promise<LegalContext>;
}

export class KnowledgeError extends Error {
  constructor(
    message: string,
    /** Absent when the service could not be reached at all. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "KnowledgeError";
  }

  /** A later attempt may succeed: the service was unreachable, busy, or still starting. */
  get temporary(): boolean {
    if (this.status === undefined) return true;
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/** The service's own limit. Asking for more is rejected. */
const maxSearchResults = 10;
const defaultTimeoutMs = 15_000;

interface SearchEdge {
  uuid: string;
  fact: string;
  name: string;
  valid_at?: string | null;
  invalid_at?: string | null;
  episodes?: string[];
}

interface SearchEpisode {
  uuid: string;
  name: string;
  source_description: string;
  content_excerpt?: string;
}

interface SearchResponse {
  agency: Agency;
  query: string;
  edges?: SearchEdge[];
  episodes?: SearchEpisode[];
}

/**
 * Reads approved legal sources for one agency.
 *
 * The knowledge service keeps a separate graph per agency and derives it from the request
 * header, so a dossier cannot read another agency's rules even if it asks for them.
 */
export function createKnowledgeSearch(baseUrl: string, timeoutMs = defaultTimeoutMs): KnowledgeSearch {
  const url = baseUrl.replace(/\/$/, "");

  return {
    async search({ agency, query, maxResults, signal }: KnowledgeSearchInput): Promise<LegalContext> {
      const trimmed = query.trim();
      if (!trimmed) throw new KnowledgeError("knowledge_query_empty", 400);

      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await fetch(`${url}/api/v1/knowledge/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", "X-Agency-Code": agency },
          body: JSON.stringify({ query: trimmed, max_results: Math.min(maxResults ?? maxSearchResults, maxSearchResults) }),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        // Unreachable, refused or timed out. No status, so the caller may try again.
        throw new KnowledgeError(error instanceof Error ? error.message : "knowledge_unreachable");
      }

      if (!response.ok) {
        throw new KnowledgeError(`knowledge_search_failed: ${(await response.text()).slice(0, 200)}`, response.status);
      }

      return asLegalContext(agency, trimmed, (await response.json()) as SearchResponse);
    },
  };
}

function asLegalContext(agency: Agency, query: string, body: SearchResponse): LegalContext {
  const episodes = new Map((body.episodes ?? []).map((episode) => [episode.uuid, episode]));
  const passages = (body.edges ?? []).flatMap((edge) => {
    const fact = edge.fact?.trim();
    if (!fact) return [];
    const episode = edge.episodes?.map((uuid) => episodes.get(uuid)).find(Boolean);
    return [{
      fact,
      source: episode?.source_description?.trim() || episode?.name?.trim() || edge.name || "unattributed",
      reference: edge.uuid,
      ...(edge.valid_at ? { validFrom: edge.valid_at } : {}),
      ...(edge.invalid_at ? { validUntil: edge.invalid_at } : {}),
      ...(episode?.content_excerpt?.trim() ? { excerpt: episode.content_excerpt.trim() } : {}),
    } satisfies LegalPassage];
  });

  return { agency, query, passages, needsReview: passages.length === 0 };
}
