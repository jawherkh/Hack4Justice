import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { REQUIREMENTS, RequirementStatus } from '@hack4justice/shared'
import { Download, Paperclip, Upload, X } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Checkbox } from '@hack4justice/ui/components/checkbox'
import { Field, FieldDescription, FieldLabel } from '@hack4justice/ui/components/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hack4justice/ui/components/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@hack4justice/ui/components/sheet'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { Textarea } from '@hack4justice/ui/components/textarea'
import { toast } from '@hack4justice/ui/components/toast'
import { cn } from '@hack4justice/ui/lib/utils'
import { UploadDropzone } from '#/components/uploads/upload-dropzone'
import { useFileDrop } from '#/components/uploads/use-file-drop'
import { UploadStatusBadge } from '#/components/uploads/upload-status-badge'
import { useI18n } from '#/i18n'
import { downloadUpload } from '#/lib/uploads'
import { ApiError } from '#/lib/api-error'
import {
  listProjectUploads,
  projectKeys,
  updateRequirement,
  uploadAndAttach,
  type ProjectRequirementView,
  type RequirementPatch,
} from '#/lib/projects'
import { REQUIREMENT_TYPE_ICON, requirementHint, requirementLabel, requirementTypeLabel } from './labels'
import { RequirementStatusBadge } from './status-badges'

interface RequirementSheetProps {
  projectId: string
  requirement: ProjectRequirementView | null
  onOpenChange: (open: boolean) => void
}

/** Side panel to provide, validate or waive one requirement. Content depends on its type. */
export function RequirementSheet({ projectId, requirement, onOpenChange }: RequirementSheetProps) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const def = requirement ? REQUIREMENTS[requirement.requirementId] : undefined
  const [details, setDetails] = React.useState('')
  const [note, setNote] = React.useState('')

  // Reset the local form each time another requirement is opened.
  React.useEffect(() => {
    setDetails(requirement?.value?.['details'] ?? '')
    setNote(requirement?.note ?? '')
  }, [requirement?.id, requirement?.value, requirement?.note])

  const uploads = useQuery({
    queryKey: projectKeys.uploads(projectId),
    queryFn: () => listProjectUploads(projectId),
    enabled: requirement !== null && def?.type === 'document',
  })

  const update = useMutation({
    mutationFn: (patch: RequirementPatch) => updateRequirement(projectId, requirement!.requirementId, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
      toast.add({ type: 'success', title: t('procedure.requirement.saved') })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('procedure.requirement.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })
  const attach = useMutation({
    mutationFn: (file: File) => uploadAndAttach(projectId, requirement!.requirementId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.uploads(projectId) })
      toast.add({ type: 'success', title: t('procedure.requirement.saved') })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('procedure.requirement.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })
  const drop = useFileDrop({
    onFile: (file) => attach.mutate(file),
    onError: (error) =>
      toast.add({
        type: 'error',
        title: t(error === 'notPdf' ? 'uploads.drop.notPdf' : 'uploads.drop.tooLarge'),
      }),
    disabled: def?.type !== 'document' || attach.isPending,
  })

  if (!requirement || !def) {
    return <Sheet open={false} onOpenChange={onOpenChange} />
  }

  const Icon = REQUIREMENT_TYPE_ICON[def.type]
  const confirmed =
    requirement.status === RequirementStatus.VALID || requirement.status === RequirementStatus.PROVIDED
  const fileItems = (uploads.data ?? []).map((file) => ({ value: file.id, label: file.filename }))

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side={locale === 'ar' ? 'left' : 'right'}
        className="flex w-full flex-col gap-0 data-[side=left]:sm:max-w-lg data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Icon className="size-3.5" />
            {t(requirementTypeLabel(def.type))}
          </div>
          <SheetTitle>{t(requirementLabel(requirement.requirementId))}</SheetTitle>
          <SheetDescription>{t(requirementHint(requirement.requirementId))}</SheetDescription>
          {def.providedBy ? (
            <p className="text-xs text-muted-foreground">
              {t('procedure.requirement.providedBy', { entity: def.providedBy.entity })}
            </p>
          ) : null}
          <div className="pt-1">
            <RequirementStatusBadge status={requirement.status} />
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          {def.type === 'document' ? (
            <div
              {...drop.handlers}
              className={cn(
                'flex flex-col gap-4 rounded-lg transition-colors',
                drop.dragging && '-m-2 border border-dashed border-primary bg-primary/5 p-2',
              )}
            >
              {drop.dragging || attach.isPending ? (
                <p className="flex items-center gap-2 text-sm text-primary">
                  <Upload className="size-4" />
                  {attach.isPending
                    ? t('procedure.requirement.uploading')
                    : t('procedure.requirement.dropHere')}
                </p>
              ) : null}
              <Field>
                <FieldLabel>{t('procedure.requirement.file')}</FieldLabel>
                {requirement.upload ? (
                  <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {requirement.upload.filename}
                    </span>
                    <UploadStatusBadge status={requirement.upload.status} />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('procedure.explorer.download')}
                      title={t('procedure.explorer.download')}
                      onClick={() => void downloadUpload(requirement.upload!.id)}
                    >
                      <Download />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('procedure.requirement.detach')}
                      disabled={update.isPending}
                      onClick={() => update.mutate({ uploadId: null })}
                    >
                      <X />
                    </Button>
                  </div>
                ) : fileItems.length > 0 ? (
                  <Select
                    items={fileItems}
                    value={null}
                    onValueChange={(value) => value && update.mutate({ uploadId: String(value) })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('procedure.requirement.chooseFile')} />
                    </SelectTrigger>
                    <SelectContent>
                      {fileItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <FieldDescription>{t('procedure.requirement.noFiles')}</FieldDescription>
                )}
              </Field>
              {!requirement.upload ? (
                <UploadDropzone
                  projectId={projectId}
                  onUploaded={(file) => update.mutate({ uploadId: file.id })}
                />
              ) : null}
            </div>
          ) : null}

          {def.type === 'data' ? (
            <Field>
              <FieldLabel htmlFor="requirement-details">{t('procedure.requirement.details')}</FieldLabel>
              <Textarea
                id="requirement-details"
                rows={5}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder={t('procedure.requirement.detailsPlaceholder')}
              />
            </Field>
          ) : null}

          {def.type === 'authentication' || def.type === 'action' ? (
            <FieldLabel className="items-center gap-3 rounded-lg border px-3 py-3">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(checked) =>
                  update.mutate({ status: checked ? RequirementStatus.VALID : RequirementStatus.MISSING })
                }
              />
              <span className="text-sm">{t('procedure.requirement.confirm')}</span>
            </FieldLabel>
          ) : null}

          <Field>
            <FieldLabel htmlFor="requirement-note">{t('procedure.requirement.note')}</FieldLabel>
            <Textarea
              id="requirement-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('procedure.requirement.notePlaceholder')}
            />
          </Field>

          {def.type === 'data' || note !== (requirement.note ?? '') ? (
            <Button
              className="self-start"
              disabled={update.isPending}
              onClick={() => update.mutate(def.type === 'data' ? { value: { details }, note } : { note })}
            >
              {update.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t('procedure.requirement.save')}
            </Button>
          ) : null}
        </div>

        <SheetFooter className="border-t">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t('procedure.requirement.status')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={requirement.status === RequirementStatus.VALID ? 'default' : 'outline'}
              disabled={update.isPending}
              onClick={() => update.mutate({ status: RequirementStatus.VALID })}
            >
              {t('procedure.requirement.markValid')}
            </Button>
            <Button
              size="sm"
              variant={requirement.status === RequirementStatus.PROVIDED ? 'secondary' : 'outline'}
              disabled={update.isPending}
              onClick={() => update.mutate({ status: RequirementStatus.PROVIDED })}
            >
              {t('procedure.requirement.markProvided')}
            </Button>
            <Button
              size="sm"
              variant={requirement.status === RequirementStatus.INVALID ? 'destructive' : 'outline'}
              disabled={update.isPending}
              onClick={() => update.mutate({ status: RequirementStatus.INVALID })}
            >
              {t('procedure.requirement.markInvalid')}
            </Button>
            {!def.required ? (
              <Button
                size="sm"
                variant={requirement.status === RequirementStatus.NOT_APPLICABLE ? 'secondary' : 'outline'}
                disabled={update.isPending}
                onClick={() => update.mutate({ status: RequirementStatus.NOT_APPLICABLE })}
              >
                {t('procedure.requirement.waive')}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending || requirement.status === RequirementStatus.MISSING}
              onClick={() => update.mutate({ status: RequirementStatus.MISSING })}
            >
              {t('procedure.requirement.reset')}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
