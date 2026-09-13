import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_DESTINATIONS,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
} from '@hack4justice/shared'
import { z } from 'zod'
import type { Translate } from '#/i18n'

/** Built per render so validation messages follow the active locale. */
export function createProjectFormSchema(t: Translate) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t('projects.validation.nameRequired'))
      .min(PROJECT_NAME_MIN_LENGTH, t('projects.validation.nameMin', { min: PROJECT_NAME_MIN_LENGTH }))
      .max(PROJECT_NAME_MAX_LENGTH, t('projects.validation.nameMax', { max: PROJECT_NAME_MAX_LENGTH })),
    destination: z.enum(PROJECT_DESTINATIONS, { message: t('projects.validation.destination') }),
    description: z
      .string()
      .trim()
      .max(PROJECT_DESCRIPTION_MAX_LENGTH, {
        message: t('projects.validation.descriptionMax', { max: PROJECT_DESCRIPTION_MAX_LENGTH }),
      }),
  })
}

export type CreateProjectValues = z.infer<ReturnType<typeof createProjectFormSchema>>
