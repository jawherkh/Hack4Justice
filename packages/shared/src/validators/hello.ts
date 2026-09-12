import { z } from "zod";

export const helloQuerySchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export type HelloQuery = z.infer<typeof helloQuerySchema>;
