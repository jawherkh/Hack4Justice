import { z } from "zod";

import { paginationQuerySchema } from "./pagination";

export const sortOrderSchema = z.enum(["asc", "desc"]).default("desc");

export type SortOrder = z.infer<typeof sortOrderSchema>;

export const searchQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export function createSortQuerySchema<TFields extends readonly [string, ...string[]]>(
  fields: TFields,
) {
  return z.object({
    sortBy: z.enum(fields).optional(),
    sortOrder: sortOrderSchema,
  });
}

export function createListQuerySchema<TFields extends readonly [string, ...string[]]>(
  fields: TFields,
) {
  return paginationQuerySchema.extend({
    search: z.string().trim().min(1).max(200).optional(),
    sortBy: z.enum(fields).optional(),
    sortOrder: sortOrderSchema,
  });
}
