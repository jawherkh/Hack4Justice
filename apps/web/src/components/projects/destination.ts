import { ProjectDestination } from '@hack4justice/shared'
import type { MessageKey } from '#/i18n'

export interface DestinationMeta {
  /** Official agency logo, served from `public/logos`. Transparent background. */
  logo: string
  label: MessageKey
  full: MessageKey
  hint: MessageKey
  /** Small status dot. */
  dot: string
  /** Badge text + border tint. */
  badge: string
  /** Hover ring tint on cards. */
  ring: string
}

/**
 * Identity per agency: official logo plus a subtle accent colour (violet for the
 * company registry, teal for the tax administration) for dots, badges and rings.
 */
export const DESTINATION_META: Record<ProjectDestination, DestinationMeta> = {
  [ProjectDestination.RNE]: {
    logo: '/logos/rne.png',
    label: 'projects.destination.RNE',
    full: 'projects.destination.RNE.full',
    hint: 'projects.destination.RNE.hint',
    dot: 'bg-violet-500',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    ring: 'hover:ring-violet-300',
  },
  [ProjectDestination.DGI]: {
    logo: '/logos/dgi.png',
    label: 'projects.destination.DGI',
    full: 'projects.destination.DGI.full',
    hint: 'projects.destination.DGI.hint',
    dot: 'bg-teal-500',
    badge: 'border-teal-200 bg-teal-50 text-teal-700',
    ring: 'hover:ring-teal-300',
  },
}
