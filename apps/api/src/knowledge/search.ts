import type { Agency } from "../access/policy";

/** One statement the knowledge service found, with the document it came from. */
export interface LegalPassage {
  /** What the source says. */
  fact: string;
  /** The document this was drawn from, as it should be cited. */
  source: string;
  /**
   * Identifies the stored document. An answer quoting this passage can be traced back to
   * the exact version that was read, and a later ingestion changes the identifier rather
   * than the meaning of an answer already given.
   */
  reference: string;
  /** The extracted relation this fact came from, when it came from one rather than from the text. */
  statement?: string;
  /** The window the statement applies in. A statement with an end date has been replaced. */
  validFrom?: string;
  validUntil?: string;
  /** A quotation from the document, for a person checking the answer. */
  excerpt?: string;
}

export interface LegalContext {
  agency: Agency;
  query: string;
  /** Only what a document backs. A statement with no document behind it is not here. */
  passages: LegalPassage[];
  /**
   * Statements the graph returned with no document attached. They are not citable, so they
   * are counted rather than returned, and a lookup that found only these needs review.
   */
  unsourcedStatements: number;
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
  const cited = new Set<string>();
  const passages: LegalPassage[] = [];
  let unsourcedStatements = 0;

  // An extracted relation states a fact, but only the episode it came from says where that
  // fact is written. A relation with no episode cannot be cited, so it is not offered as if
  // it could be: its relation name is not a source.
  for (const edge of body.edges ?? []) {
    const fact = edge.fact?.trim();
    if (!fact) continue;
    const episode = (edge.episodes ?? []).map((uuid) => episodes.get(uuid)).find((candidate) => provenance(candidate));
    const source = provenance(episode);
    if (!episode || !source) {
      unsourcedStatements += 1;
      continue;
    }
    cited.add(episode.uuid);
    passages.push({
      fact,
      source,
      reference: episode.uuid,
      statement: edge.uuid,
      ...(edge.valid_at ? { validFrom: edge.valid_at } : {}),
      ...(edge.invalid_at ? { validUntil: edge.invalid_at } : {}),
      ...(episode.content_excerpt?.trim() ? { excerpt: episode.content_excerpt.trim() } : {}),
    });
  }

  // Matching text that no relation was extracted from is still the law, and it carries its
  // own provenance. Dropping it would report a found source as nothing found.
  for (const episode of body.episodes ?? []) {
    if (cited.has(episode.uuid)) continue;
    const source = provenance(episode);
    const text = episode.content_excerpt?.trim();
    if (!source || !text) continue;
    passages.push({ fact: text, source, reference: episode.uuid, excerpt: text });
  }

  return { agency, query, passages, unsourcedStatements, needsReview: passages.length === 0 };
}

/** How a document should be cited, or nothing when it does not say where it came from. */
function provenance(episode: SearchEpisode | undefined): string | undefined {
  return episode?.source_description?.trim() || episode?.name?.trim() || undefined;
}
