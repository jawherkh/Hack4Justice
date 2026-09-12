import { Elysia } from "elysia";

import { helloQuerySchema } from "@hack4justice/shared";

export const helloModule = new Elysia().get(
  "/hello",
  ({ query }) => ({ message: `Hello, ${query.name ?? "Hack4Justice"}!` }),
  {
    query: helloQuerySchema,
  },
);
