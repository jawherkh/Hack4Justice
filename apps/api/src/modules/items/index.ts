import { Elysia } from "elysia";

import { buildPaginatedResponse, createListQuerySchema, getPagination } from "@hack4justice/shared";

export const itemsModule = new Elysia().get(
  "/items",
  ({ query }) => {
    const { limit, offset } = getPagination(query);
    const all = ["alpha", "bravo", "charlie", "delta", "echo"];
    const data = all.slice(offset, offset + limit);
    return buildPaginatedResponse({
      data,
      page: query.page,
      limit,
      total: all.length,
    });
  },
  {
    query: createListQuerySchema(["name"] as const),
  },
);
