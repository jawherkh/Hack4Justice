import { ProjectDestination } from '@hack4justice/shared'
import { Building2, Landmark } from 'lucide-react'
import type { MessageKey } from '#/i18n'

export interface DestinationMeta {
  icon: typeof Building2
  label: MessageKey
  full: MessageKey
  hint: MessageKey
  /** Icon tile background + foreground. */
  tile: string
  /** Small status dot. */
  dot: string
  /** Badge text + border tint. */
  badge: string
  /** Hover ring tint on cards. */
  ring: string
}

/**
 * Visual identity per agency, so a project's destination is readable at a
 * glance without reading the label: violet for the company registry, teal for
 * the tax administration.
 */
export const DESTINATION_META: Record<ProjectDestination, DestinationMeta> = {
  [ProjectDestination.RNE]: {
    icon: Building2,
    label: 'projects.destination.RNE',
    full: 'projects.destination.RNE.full',
    hint: 'projects.destination.RNE.hint',
    tile: 'bg-violet-100 text-violet-700',
    dot: 'bg-violet-500',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    ring: 'hover:ring-violet-300',
  },
  [ProjectDestination.DGI]: {
    icon: Landmark,
    label: 'projects.destination.DGI',
    full: 'projects.destination.DGI.full',
    hint: 'projects.destination.DGI.hint',
    tile: 'bg-teal-100 text-teal-700',
    dot: 'bg-teal-500',
    badge: 'border-teal-200 bg-teal-50 text-teal-700',
    ring: 'hover:ring-teal-300',
  },
}
