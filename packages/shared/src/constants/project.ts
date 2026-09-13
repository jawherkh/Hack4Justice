/**
 * Agency a project is prepared for. Each destination has its own procedure,
 * required documents and submission channel.
 *
 * - RNE: Registre National des Entreprises (company registry)
 * - DGI: Direction Générale des Impôts (tax administration)
 */
export const ProjectDestination = {
  RNE: "RNE",
  DGI: "DGI",
} as const;

export type ProjectDestination = (typeof ProjectDestination)[keyof typeof ProjectDestination];

/** Tuple form for enum definitions (Drizzle `pgEnum`, zod `enum`). */
export const PROJECT_DESTINATIONS = Object.values(ProjectDestination) as [
  ProjectDestination,
  ...ProjectDestination[],
];

export function isProjectDestination(value: unknown): value is ProjectDestination {
  return typeof value === "string" && (PROJECT_DESTINATIONS as readonly string[]).includes(value);
}

export const PROJECT_NAME_MIN_LENGTH = 2;
export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;
