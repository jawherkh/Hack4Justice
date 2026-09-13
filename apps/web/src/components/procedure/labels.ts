import type { ProcedureStatus, ProcedureStep, RequirementStatus, RequirementType } from '@hack4justice/shared'
import { ClipboardCheck, Database, FileText, KeyRound } from 'lucide-react'
import type { MessageKey } from '#/i18n'

/** Keys are generated alongside the catalog; the casts are checked by the i18n type at build time. */
export const serviceName = (id: string) => `procedure.service.${id}.name` as MessageKey
export const serviceSummary = (id: string) => `procedure.service.${id}.summary` as MessageKey
export const requirementLabel = (id: string) => `procedure.requirement.${id}` as MessageKey
export const submissionModeLabel = (mode: string) => `procedure.mode.${mode}` as MessageKey
export const stepTitle = (step: ProcedureStep) => `procedure.step.${step}.title` as MessageKey
export const stepDescription = (step: ProcedureStep) => `procedure.step.${step}.description` as MessageKey
export const procedureStatusLabel = (status: ProcedureStatus) => `procedure.status.${status}` as MessageKey
export const requirementStatusLabel = (status: RequirementStatus) =>
  `procedure.requirementStatus.${status}` as MessageKey
export const requirementTypeLabel = (type: RequirementType) => `procedure.type.${type}` as MessageKey

export const REQUIREMENT_TYPE_ICON: Record<RequirementType, typeof FileText> = {
  document: FileText,
  data: Database,
  authentication: KeyRound,
  action: ClipboardCheck,
}

/** Catalog output / entity ids are SCREAMING_SNAKE; show them as words. */
export function humanize(id: string): string {
  const words = id.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
