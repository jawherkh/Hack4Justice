import { z } from "zod";

import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_DESTINATIONS,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
} from "../constants/project";

export const projectDestinationSchema = z.enum(PROJECT_DESTINATIONS);

export const projectNameSchema = z.string().trim().min(PROJECT_NAME_MIN_LENGTH).max(PROJECT_NAME_MAX_LENGTH);

export const projectDescriptionSchema = z.string().trim().max(PROJECT_DESCRIPTION_MAX_LENGTH);

export const createProjectSchema = z.object({
  name: projectNameSchema,
  destination: projectDestinationSchema,
  description: projectDescriptionSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const listProjectsQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  destination: projectDestinationSchema.optional(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
