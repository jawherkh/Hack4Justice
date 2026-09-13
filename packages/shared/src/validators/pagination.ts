import { z } from "zod";

import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "../constants/pagination";

export const pageSchema = z.coerce.number().int().min(1).default(DEFAULT_PAGE);

export const limitSchema = z.coerce
  .number()
  .int()
  .min(MIN_PAGE_SIZE)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE);

export const paginationQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function getPagination({ page, limit }: PaginationQuery) {
  return { limit, offset: (page - 1) * limit };
}

const pageInfoSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type PageInfo = z.infer<typeof pageInfoSchema>;

export function createPaginatedResponseSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    data: z.array(item),
    meta: pageInfoSchema,
  });
}

export function buildPaginatedResponse<TItem>({
  data,
  page,
  limit,
  total,
}: {
  data: TItem[];
  page: number;
  limit: number;
  total: number;
}) {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
