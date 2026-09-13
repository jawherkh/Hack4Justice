import * as React from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_DESTINATIONS,
  ProjectDestination,
  type ProjectDestination as ProjectDestinationType,
} from '@hack4justice/shared'
import { Check, Plus } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hack4justice/ui/components/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { Textarea } from '@hack4justice/ui/components/textarea'
import { toast } from '@hack4justice/ui/components/toast'
import { cn } from '@hack4justice/ui/lib/utils'
import { useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { createProject, projectKeys, type ProjectSummary } from '#/lib/projects'
import { DESTINATION_META } from './destination'
import { createProjectFormSchema, type CreateProjectValues } from './schemas'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-select a destination, e.g. when a filter is active. */
  defaultDestination?: ProjectDestinationType
  onCreated?: (project: ProjectSummary) => void
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultDestination,
  onCreated,
}: CreateProjectDialogProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const nameRef = React.useRef<HTMLInputElement>(null)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const create = useMutation({
    mutationFn: (input: Parameters<typeof createProject>[0]) => createProject(input),
    onSuccess: (project) => {
      // Show it at the top immediately; the refetch reconciles ordering.
      queryClient.setQueryData<ProjectSummary[]>(projectKeys.all, (previous) => [
        project,
        ...(previous ?? []),
      ])
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
      toast.add({ type: 'success', title: t('projects.create.created', { name: project.name }) })
      onOpenChange(false)
      onCreated?.(project)
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : t('projects.create.error'))
    },
  })

  const defaultValues: CreateProjectValues = {
    name: '',
    destination: defaultDestination ?? ProjectDestination.RNE,
    description: '',
  }

  const form = useForm({
    defaultValues,
    validators: { onSubmit: createProjectFormSchema(t) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const description = value.description.trim()
      try {
        await create.mutateAsync({
          name: value.name.trim(),
          destination: value.destination,
          ...(description ? { description } : {}),
        })
      } catch {
        // Surfaced through `onError`; keep the dialog open so the user can retry.
      }
    },
  })

  // Fresh form every time the dialog opens.
  React.useEffect(() => {
    if (!open) return
    form.reset(defaultValues)
    setServerError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDestination])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Plus className="size-4" />
            </span>
            {t('projects.create.title')}
          </DialogTitle>
          <DialogDescription>{t('projects.create.description')}</DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const invalid = field.state.meta.isTouched && field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel htmlFor="project-name">{t('projects.create.name')}</FieldLabel>
                    <Input
                      ref={nameRef}
                      id="project-name"
                      name={field.name}
                      autoComplete="off"
                      placeholder={t('projects.create.namePlaceholder')}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={invalid || undefined}
                    />
                    {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="destination">
              {(field) => {
                const invalid = field.state.meta.isTouched && field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel id="project-destination-label">{t('projects.create.destination')}</FieldLabel>
                    <div
                      role="radiogroup"
                      aria-labelledby="project-destination-label"
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      {PROJECT_DESTINATIONS.map((value) => (
                        <DestinationOption
                          key={value}
                          value={value}
                          selected={field.state.value === value}
                          onSelect={() => field.handleChange(value)}
                        />
                      ))}
                    </div>
                    {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="description">
              {(field) => {
                const invalid = field.state.meta.isTouched && field.state.meta.errors.length > 0
                const remaining = PROJECT_DESCRIPTION_MAX_LENGTH - field.state.value.length
                return (
                  <Field data-invalid={invalid || undefined}>
                    <div className="flex items-baseline justify-between">
                      <FieldLabel htmlFor="project-description">
                        {t('projects.create.descriptionLabel')}
                      </FieldLabel>
                      <span
                        className={cn(
                          'text-xs text-muted-foreground tabular-nums transition-opacity',
                          field.state.value.length === 0 && 'opacity-0',
                          remaining < 0 && 'text-destructive',
                        )}
                      >
                        {remaining}
                      </span>
                    </div>
                    <Textarea
                      id="project-description"
                      name={field.name}
                      rows={3}
                      placeholder={t('projects.create.descriptionPlaceholder')}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={invalid || undefined}
                      className="resize-none"
                    />
                    {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            </form.Field>

            {serverError ? (
              <Field data-invalid>
                <FieldError>{serverError}</FieldError>
              </Field>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('projects.create.cancel')}
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                  {t('projects.create.submit')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Choice card. A native radio keeps keyboard + form semantics; the visible
 * card is the label so the whole surface is clickable.
 */
function DestinationOption({
  value,
  selected,
  onSelect,
}: {
  value: ProjectDestinationType
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useI18n()
  const meta = DESTINATION_META[value]
  const id = `project-destination-${value}`
  return (
    <label
      htmlFor={id}
      data-selected={selected || undefined}
      className={cn(
        'group/option relative flex cursor-pointer flex-col items-center gap-3 rounded-lg border bg-background px-3 pt-5 pb-4 text-center transition-all',
        'hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input',
      )}
    >
      <input
        id={id}
        type="radio"
        name="destination"
        value={value}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <img
        src={meta.logo}
        alt=""
        aria-hidden
        draggable={false}
        className="h-12 w-auto max-w-28 object-contain"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold tracking-wide">{t(meta.label)}</span>
        <span className="text-xs leading-snug text-muted-foreground">{t(meta.full)}</span>
        <span className="mt-1 text-xs leading-snug text-muted-foreground/80">{t(meta.hint)}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'absolute end-2.5 top-2.5 flex size-4 items-center justify-center rounded-full border transition-all',
          selected
            ? 'scale-100 border-primary bg-primary text-primary-foreground'
            : 'scale-90 border-input opacity-60',
        )}
      >
        <Check className={cn('size-3 transition-opacity', selected ? 'opacity-100' : 'opacity-0')} />
      </span>
    </label>
  )
}
