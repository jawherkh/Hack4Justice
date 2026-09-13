import { ProjectDestination } from '@hack4justice/shared'
import type { MessageKey } from '#/i18n'

export interface DestinationMeta {
  /** Official agency logo, served from `public/logos`. Transparent background. */
  logo: string
  label: MessageKey
  full: MessageKey
  hint: MessageKey
}

/** Identity per agency: official logo and translated labels. */
export const DESTINATION_META: Record<ProjectDestination, DestinationMeta> = {
  [ProjectDestination.RNE]: {
    logo: '/logos/rne.png',
    label: 'projects.destination.RNE',
    full: 'projects.destination.RNE.full',
    hint: 'projects.destination.RNE.hint',
  },
  [ProjectDestination.DGI]: {
    logo: '/logos/dgi.png',
    label: 'projects.destination.DGI',
    full: 'projects.destination.DGI.full',
    hint: 'projects.destination.DGI.hint',
  },
}
