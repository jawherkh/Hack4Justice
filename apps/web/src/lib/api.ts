import { treaty } from "@elysiajs/eden";
import type { App } from "@hack4justice/api/app";

const baseUrl =
  (import.meta.env["VITE_API_URL"] as string | undefined) ??
  "http://localhost:3001";

const client = treaty<App>(baseUrl);

export async function fetchHello() {
  const { data, error } = await client.api.v1.hello.get();
  if (error) throw error;
  return data;
}

export async function fetchItems(variables?: {
  page?: number;
  limit?: number;
}) {
  const { data, error } = await client.api.v1.items.get({
    query: {
      page: variables?.page ?? 1,
      limit: variables?.limit ?? 3,
      sortOrder: "desc",
    },
  });
  if (error) throw error;
  return data;
}
