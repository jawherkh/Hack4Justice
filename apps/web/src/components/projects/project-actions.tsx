import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, MoreHorizontal, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@hack4justice/ui/components/alert-dialog'
import { Button } from '@hack4justice/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@hack4justice/ui/components/dropdown-menu'
import { toast } from '@hack4justice/ui/components/toast'
import { cn } from '@hack4justice/ui/lib/utils'
import { toLocaleParam, useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { deleteProject, projectKeys, type ProjectSummary } from '#/lib/projects'

interface ProjectActionsProps {
  project: Pick<ProjectSummary, 'id' | 'name'>
  /** Hide "Open" when the menu already sits on the project's own page. */
  showOpen?: boolean
  onDeleted?: () => void | Promise<void>
  className?: string
}

/** Kebab menu: open, delete (with confirmation). Safe to place over a stretched card link. */
export function ProjectActions({ project, showOpen = true, onDeleted, className }: ProjectActionsProps) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = React.useState(false)

  const remove = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: async () => {
      queryClient.setQueryData<ProjectSummary[]>(projectKeys.all, (previous) =>
        previous?.filter((item) => item.id !== project.id),
      )
      toast.add({ type: 'success', title: t('projects.delete.done') })
      setConfirming(false)
      await onDeleted?.()
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('projects.delete.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('projects.actions.menu')}
              className={cn('relative z-10 text-muted-foreground hover:text-foreground', className)}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showOpen ? (
            <>
              <DropdownMenuItem
                render={
                  <Link
                    to="/{-$locale}/projects/$id"
                    params={{ locale: toLocaleParam(locale), id: project.id }}
                  />
                }
              >
                <ArrowUpRight />
                {t('projects.actions.open')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 />
            {t('projects.actions.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.delete.description', { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t('projects.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t('projects.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
