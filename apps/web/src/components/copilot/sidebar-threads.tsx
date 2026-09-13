import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hack4justice/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@hack4justice/ui/components/dropdown-menu'
import { Input } from '@hack4justice/ui/components/input'
import {
  SidebarMenuAction,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@hack4justice/ui/components/sidebar'
import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { toLocaleParam, useI18n } from '#/i18n'
import {
  copilotKeys,
  createConversation,
  deleteConversation,
  listConversations,
  renameConversation,
  type CopilotConversation,
} from '#/lib/copilot'

/** How many threads the sidebar lists before the rest is only reachable from the welcome page. */
const MAX_VISIBLE = 12

/**
 * Conversations of the project, nested under the "Copilot" sidebar entry.
 * Returns the "+" action plus the sub-list; the caller places them inside a SidebarMenuItem.
 */
export function CopilotSidebarThreads({ projectId }: { projectId: string }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const queryClient = useQueryClient()
  const params = { locale: toLocaleParam(locale), id: projectId }
  const match = matchRoute({ to: '/{-$locale}/projects/$id/copilot/$conversationId', params })
  const activeId = match ? match.conversationId : undefined
  const threads = useQuery({
    queryKey: copilotKeys.all(projectId),
    queryFn: () => listConversations(projectId),
  })
  const [renaming, setRenaming] = React.useState<CopilotConversation | null>(null)
  const [deleting, setDeleting] = React.useState<CopilotConversation | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: copilotKeys.all(projectId), exact: true })

  const create = useMutation({
    mutationFn: () => createConversation(projectId),
    onSuccess: async (conversation) => {
      await invalidate()
      await navigate({
        to: '/{-$locale}/projects/$id/copilot/$conversationId',
        params: { ...params, conversationId: conversation.id },
      })
    },
  })
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(projectId, id, title),
    onSuccess: async (_data, { id }) => {
      setRenaming(null)
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: copilotKeys.conversation(projectId, id) })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteConversation(projectId, id),
    onSuccess: async (_data, id) => {
      setDeleting(null)
      await invalidate()
      if (id === activeId) await navigate({ to: '/{-$locale}/projects/$id/copilot', params })
    },
  })

  const conversations = threads.data?.conversations ?? []

  return (
    <>
      <SidebarMenuAction
        aria-label={t('copilot.newChat')}
        title={t('copilot.newChat')}
        disabled={create.isPending}
        onClick={() => create.mutate()}
      >
        <PlusIcon />
      </SidebarMenuAction>

      {threads.isPending ? (
        <SidebarMenuSub className="ml-0 border-l-0 px-1.5">
          <SidebarMenuSubItem>
            <SidebarMenuSkeleton />
          </SidebarMenuSubItem>
          <SidebarMenuSubItem>
            <SidebarMenuSkeleton />
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      ) : conversations.length > 0 ? (
        <SidebarMenuSub className="ml-0 border-l-0 px-1.5">
          {conversations.slice(0, MAX_VISIBLE).map((conversation) => (
            <SidebarMenuSubItem key={conversation.id} className="group/thread relative">
              <SidebarMenuSubButton
                isActive={conversation.id === activeId}
                className="pe-7"
                render={
                  <Link
                    to="/{-$locale}/projects/$id/copilot/$conversationId"
                    params={{ ...params, conversationId: conversation.id }}
                  />
                }
              >
                <span className="truncate">{conversation.title ?? t('copilot.untitled')}</span>
              </SidebarMenuSubButton>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuAction
                      aria-label={t('copilot.threadActions')}
                      className="top-1/2 -translate-y-1/2 opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 rtl:right-auto rtl:left-1"
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setRenaming(conversation)}>
                      <PencilIcon />
                      {t('copilot.rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(conversation)}>
                      <Trash2Icon />
                      {t('copilot.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      ) : null}

      <RenameDialog
        conversation={renaming}
        pending={rename.isPending}
        onClose={() => setRenaming(null)}
        onSubmit={(title) => renaming && rename.mutate({ id: renaming.id, title })}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('copilot.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('copilot.deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('copilot.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              {t('copilot.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function RenameDialog({
  conversation,
  pending,
  onClose,
  onSubmit,
}: {
  conversation: CopilotConversation | null
  pending: boolean
  onClose: () => void
  onSubmit: (title: string) => void
}) {
  const { t } = useI18n()
  const [title, setTitle] = React.useState('')
  React.useEffect(() => {
    setTitle(conversation?.title ?? '')
  }, [conversation])
  return (
    <Dialog open={conversation !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            const value = title.trim()
            if (value) onSubmit(value)
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('copilot.rename')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={title}
            maxLength={120}
            aria-label={t('copilot.titleLabel')}
            onChange={(event) => setTitle(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('copilot.cancel')}
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {t('copilot.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
