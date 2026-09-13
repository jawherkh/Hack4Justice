import type { Agency } from "../access/policy";

/** One statement the knowledge service found, with the document it came from. */
export interface LegalPassage {
  /** What the source says. */
  fact: string;
  /**
   * Identifies the document this was drawn from. An answer quoting this passage can be
   * traced back to the exact version that was read, and a later ingestion changes the
   * identifier rather than the meaning of an answer already given.
   */
  reference: string;
  /**
   * How to cite that document. Absent when the search returned the statement without also
   * returning the document it names: the statement is still traceable by its reference, but
   * naming a source that was not returned would be inventing one.
   */
  source?: string;
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
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Agency-Code": agency,
          },
          body: JSON.stringify({
            query: trimmed,
            max_results: Math.min(maxResults ?? maxSearchResults, maxSearchResults),
          }),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        // Unreachable, refused or timed out. No status, so the caller may try again.
        throw new KnowledgeError(error instanceof Error ? error.message : "knowledge_unreachable");
      }

      if (!response.ok) {
        throw new KnowledgeError(
          `knowledge_search_failed: ${(await response.text()).slice(0, 200)}`,
          response.status,
        );
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

  // An extracted relation states a fact; the episodes it names say where that fact is
  // written. The service ranks and caps edges and episodes separately, so an edge often
  // names an episode this response did not carry. That is still provenance, and dropping it
  // would discard law the service did find. A relation naming no episode at all is
  // different: it has no document behind it, and its relation name is not a source.
  for (const edge of body.edges ?? []) {
    const fact = edge.fact?.trim();
    if (!fact) continue;
    const named = (edge.episodes ?? []).filter((uuid) => uuid);
    if (named.length === 0) {
      unsourcedStatements += 1;
      continue;
    }
    const episode = named.map((uuid) => episodes.get(uuid)).find((candidate) => provenance(candidate));
    const source = provenance(episode);
    const reference = episode?.uuid ?? named[0]!;
    if (episode) cited.add(episode.uuid);
    passages.push({
      fact,
      reference,
      ...(source ? { source } : {}),
      statement: edge.uuid,
      ...(edge.valid_at ? { validFrom: edge.valid_at } : {}),
      ...(edge.invalid_at ? { validUntil: edge.invalid_at } : {}),
      ...(episode?.content_excerpt?.trim() ? { excerpt: episode.content_excerpt.trim() } : {}),
    });
  }

  // Matching text that no relation was extracted from is still the law, and it carries its
  // own provenance. Dropping it would report a found source as nothing found.
  for (const episode of body.episodes ?? []) {
    if (cited.has(episode.uuid)) continue;
    const source = provenance(episode);
    const text = episode.content_excerpt?.trim();
    if (!source || !text) continue;
    passages.push({ fact: text, reference: episode.uuid, source, excerpt: text });
  }

  return { agency, query, passages, unsourcedStatements, needsReview: passages.length === 0 };
}

/** How a document should be cited, or nothing when it does not say where it came from. */
function provenance(episode: SearchEpisode | undefined): string | undefined {
  return episode?.source_description?.trim() || episode?.name?.trim() || undefined;
}
