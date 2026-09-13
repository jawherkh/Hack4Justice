import * as React from 'react'
import { REQUIREMENTS, type ProcedureStep, type ServiceDef, type StepProgress } from '@hack4justice/shared'
import {
  ChevronDown,
  CircleHelp,
  Info,
  KeyRound,
  ListChecks,
  PackageCheck,
  Radio,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { cn } from '@hack4justice/ui/lib/utils'
import { useI18n, type MessageKey } from '#/i18n'
import { messages } from '#/i18n/messages'
import { REQUIREMENT_TYPE_ICON, humanize, requirementTypeLabel } from './labels'

const authLabel = (method: string) => `procedure.auth.${method}` as MessageKey
const channelLabel = (channel: string) => `procedure.channel.${channel}` as MessageKey
const checkLabel = (serviceId: string, node: string) => `procedure.check.${serviceId}.${node}` as MessageKey
const typeHint = (type: string) => `procedure.type.${type}.hint` as MessageKey

/** Instruction bullets are numbered keys; read until one is missing. */
function stepInstructions(step: ProcedureStep): MessageKey[] {
  const keys: MessageKey[] = []
  for (let i = 1; i <= 6; i += 1) {
    const key = `procedure.step.${step}.instruction.${i}` as MessageKey
    if (!(key in messages.en)) break
    keys.push(key)
  }
  return keys
}

/** Which self-check questions belong to which step, by decision-tree node name. */
function checksForStep(step: ProcedureStep, checks: string[]): string[] {
  const isReview = (node: string) => /validation|consult/i.test(node)
  const isAuth = (node: string) => /authenticate/i.test(node)
  switch (step) {
    case 'PREVALIDATION':
      return checks.filter((c) => !isReview(c) && !isAuth(c))
    case 'AUTHENTICATION':
      return checks.filter(isAuth)
    case 'UNDER_REVIEW':
      return checks.filter(isReview)
    default:
      return []
  }
}

interface StepGuideProps {
  step: StepProgress
  service: ServiceDef
  /** Open by default for the step the user is on. */
  defaultOpen: boolean
}

/** Collapsible explanation under a timeline step: what to do, self-checks, channel facts. */
export function StepGuide({ step, service, defaultOpen }: StepGuideProps) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(defaultOpen)
  const instructions = stepInstructions(step.step)
  const checks = checksForStep(step.step, service.checks)
  const typesInStep = [...new Set(step.requirementIds.map((id) => REQUIREMENTS[id]?.type).filter(Boolean))]

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-ms-2 w-fit text-muted-foreground"
      >
        <Info data-icon="inline-start" />
        {open ? t('procedure.guide.hide') : t('procedure.guide.show')}
        <ChevronDown data-icon="inline-end" className={cn('transition-transform', open && 'rotate-180')} />
      </Button>

      {open ? (
        <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 text-sm md:grid-cols-2">
          <Section icon={ListChecks} title={t('procedure.guide.whatToDo')} className="md:col-span-2">
            <ol className="list-decimal space-y-1.5 ps-5">
              {instructions.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
            {step.step === 'COLLECT_REQUIREMENTS' && typesInStep.length ? (
              <ul className="mt-2 flex flex-col gap-1">
                {typesInStep.map((type) => {
                  const Icon = REQUIREMENT_TYPE_ICON[type!]
                  return (
                    <li key={type} className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="size-3.5 shrink-0" />
                      <span className="font-medium text-foreground">{t(requirementTypeLabel(type!))}:</span>
                      {t(typeHint(type!))}
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {step.step === 'OFFICIAL_SUBMISSION' ? (
              <p className="mt-2 flex items-center gap-2 text-muted-foreground">
                <ShieldAlert className="size-3.5 shrink-0" />
                {t('procedure.guide.noSubmit')}
              </p>
            ) : null}
          </Section>

          {checks.length ? (
            <Section icon={CircleHelp} title={t('procedure.guide.selfCheck')}>
              <ul className="space-y-1.5">
                {checks.map((node) => (
                  <li key={node} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    {t(checkLabel(service.id, node))}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {step.step === 'AUTHENTICATION' && service.authenticationMethods.length ? (
            <Section icon={KeyRound} title={t('procedure.guide.auth')}>
              <ul className="flex flex-wrap gap-1.5">
                {service.authenticationMethods.map((method) => (
                  <li
                    key={method}
                    className="rounded-md bg-background px-2 py-0.5 text-xs ring-1 ring-border"
                  >
                    {t(authLabel(method))}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {(step.step === 'READY_FOR_SUBMISSION' || step.step === 'OFFICIAL_SUBMISSION') &&
          service.channels.length ? (
            <Section icon={Radio} title={t('procedure.guide.channels')}>
              <ul className="flex flex-wrap gap-1.5">
                {service.channels.map((channel) => (
                  <li
                    key={channel}
                    className="rounded-md bg-background px-2 py-0.5 text-xs ring-1 ring-border"
                  >
                    {t(channelLabel(channel))}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {step.step === 'UNDER_REVIEW' && service.rejectionEffects.length ? (
            <Section icon={ShieldAlert} title={t('procedure.guide.rejection')}>
              <ul className="space-y-1 text-muted-foreground">
                {service.rejectionEffects.map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
            </Section>
          ) : null}

          {step.step === 'ACCEPTED' && service.outputs.length ? (
            <Section icon={PackageCheck} title={t('procedure.guide.outputs')}>
              <ul className="flex flex-wrap gap-1.5">
                {service.outputs.map((output) => (
                  <li
                    key={output}
                    className="rounded-md bg-background px-2 py-0.5 text-xs ring-1 ring-border"
                  >
                    {humanize(output)}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {step.step === 'COLLECT_REQUIREMENTS' && service.notes.length ? (
            <Section icon={Info} title={t('procedure.guide.notes')} className="md:col-span-2">
              <ul className="space-y-1 text-muted-foreground">
                {service.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  className,
  children,
}: {
  icon: typeof Info
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {title}
      </h4>
      {children}
    </section>
  )
}
