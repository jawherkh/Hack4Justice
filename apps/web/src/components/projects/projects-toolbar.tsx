import * as React from 'react'
import { LayoutGrid, List, Search, X } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@hack4justice/ui/components/input-group'
import { Kbd } from '@hack4justice/ui/components/kbd'
import { ToggleGroup, ToggleGroupItem } from '@hack4justice/ui/components/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@hack4justice/ui/components/tooltip'
import { useTranslation } from '#/i18n'
import type { ViewMode } from './view-mode'

interface ProjectsToolbarProps {
  query: string
  onQueryChange: (query: string) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  /** Text shown on the start side, e.g. "6 projects". */
  summary?: React.ReactNode
}

export function ProjectsToolbar({ query, onQueryChange, view, onViewChange, summary }: ProjectsToolbarProps) {
  const t = useTranslation()
  const inputRef = React.useRef<HTMLInputElement>(null)

  // "/" focuses search from anywhere on the page, like GitHub.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {summary ? <p className="text-sm text-muted-foreground sm:me-auto">{summary}</p> : null}
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            type="search"
            role="searchbox"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault()
                onQueryChange('')
              }
            }}
            placeholder={t('projects.search.placeholder')}
            aria-label={t('projects.search.placeholder')}
            className="[&::-webkit-search-cancel-button]:hidden"
          />
          <InputGroupAddon align="inline-end">
            {query ? (
              <InputGroupButton
                size="icon-xs"
                variant="ghost"
                aria-label={t('projects.search.clear')}
                onClick={() => {
                  onQueryChange('')
                  inputRef.current?.focus()
                }}
              >
                <X />
              </InputGroupButton>
            ) : (
              <Kbd className="hidden md:inline-flex">/</Kbd>
            )}
          </InputGroupAddon>
        </InputGroup>

        <ToggleGroup
          aria-label={t('projects.view.label')}
          variant="outline"
          spacing={0}
          value={[view]}
          onValueChange={(values) => {
            const next = values[0]
            if (next === 'grid' || next === 'list') onViewChange(next)
          }}
        >
          <ViewItem value="grid" label={t('projects.view.grid')} icon={LayoutGrid} />
          <ViewItem value="list" label={t('projects.view.list')} icon={List} />
        </ToggleGroup>
      </div>
    </TooltipProvider>
  )
}

function ViewItem({ value, label, icon: Icon }: { value: ViewMode; label: string; icon: typeof List }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<ToggleGroupItem value={value} aria-label={label} className="w-9" />}>
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.closest('[role="dialog"]') !== null
  )
}
