import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { REQUIREMENTS, RequirementStatus } from '@hack4justice/shared'
import { Paperclip, Send, ShieldAlert } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hack4justice/ui/components/dialog'
import { Field, FieldLabel } from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { Textarea } from '@hack4justice/ui/components/textarea'
import { toast } from '@hack4justice/ui/components/toast'
import { useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { projectKeys, submitProject, type ProjectDetail } from '#/lib/projects'
import { REQUIREMENT_TYPE_ICON, requirementLabel } from './labels'
import { RequirementStatusBadge } from './status-badges'

interface SubmitDialogProps {
  project: ProjectDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Confirms an official submission made on the agency channel and freezes the checklist as its record. */
export function SubmitDialog({ project, open, onOpenChange }: SubmitDialogProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [receipt, setReceipt] = React.useState('')
  const [note, setNote] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setReceipt('')
      setNote('')
    }
  }, [open])

  const submit = useMutation({
    mutationFn: () =>
      submitProject(project.id, {
        ...(receipt.trim() ? { receipt: receipt.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
      toast.add({ type: 'success', title: t('procedure.submit.done', { reference: created.reference }) })
      onOpenChange(false)
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('procedure.submit.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })

  const included = project.requirements.filter(
    (r) => r.status !== RequirementStatus.NOT_APPLICABLE && r.status !== RequirementStatus.WAIVED,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Send className="size-4" />
            </span>
            {t('procedure.submit.title')}
          </DialogTitle>
          <DialogDescription>{t('procedure.submit.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            {t('procedure.submit.reminder')}
          </p>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('procedure.submit.included')}
            </p>
            <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
              {included.map((r) => {
                const Icon = REQUIREMENT_TYPE_ICON[REQUIREMENTS[r.requirementId]?.type ?? 'data']
                return (
                  <li key={r.requirementId} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{t(requirementLabel(r.requirementId))}</span>
                      {r.upload ? (
                        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <Paperclip className="size-3" />
                          {r.upload.filename}
                        </span>
                      ) : null}
                    </span>
                    <RequirementStatusBadge status={r.status} />
                  </li>
                )
              })}
            </ul>
          </div>

          <Field>
            <FieldLabel htmlFor="submission-receipt">{t('procedure.submit.receipt')}</FieldLabel>
            <Input
              id="submission-receipt"
              value={receipt}
              onChange={(event) => setReceipt(event.target.value)}
              placeholder={t('procedure.submit.receiptPlaceholder')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="submission-note">{t('procedure.submit.note')}</FieldLabel>
            <Textarea
              id="submission-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('procedure.submit.notePlaceholder')}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('procedure.submit.cancel')}
          </Button>
          <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            {t('procedure.submit.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
