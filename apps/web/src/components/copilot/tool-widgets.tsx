import * as React from 'react'
import type { ProcedureStatus, ProcedureStep, RequirementStatus, UploadStatus } from '@hack4justice/shared'
import { CodeBlock } from '@hack4justice/ui/components/ai-elements/code-block'
import { Shimmer } from '@hack4justice/ui/components/ai-elements/shimmer'
import { Alert, AlertDescription, AlertTitle } from '@hack4justice/ui/components/alert'
import { Badge } from '@hack4justice/ui/components/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@hack4justice/ui/components/collapsible'
import { cn } from '@hack4justice/ui/lib/utils'
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  CircleIcon,
  FileTextIcon,
  ScaleIcon,
  XCircleIcon,
} from 'lucide-react'
import { humanize, requirementLabel, stepTitle } from '#/components/procedure/labels'
import { ProcedureStatusBadge, RequirementStatusBadge } from '#/components/procedure/status-badges'
import { UploadStatusBadge } from '#/components/uploads/upload-status-badge'
import { useI18n, type MessageKey } from '#/i18n'
import { FileChip } from './file-panel'
import type { ChatToolCall } from './use-copilot-chat'

/** Present tense while the call runs, past tense once it has finished (Codex style). */
const TOOL_LABEL: Record<string, { running: MessageKey; done: MessageKey }> = {
  get_project_overview: {
    running: 'copilot.tool.get_project_overview',
    done: 'copilot.tool.get_project_overview.done',
  },
  get_requirement_details: {
    running: 'copilot.tool.get_requirement_details',
    done: 'copilot.tool.get_requirement_details.done',
  },
  list_project_documents: {
    running: 'copilot.tool.list_project_documents',
    done: 'copilot.tool.list_project_documents.done',
  },
  read_document_text: {
    running: 'copilot.tool.read_document_text',
    done: 'copilot.tool.read_document_text.done',
  },
  search_legal_sources: {
    running: 'copilot.tool.search_legal_sources',
    done: 'copilot.tool.search_legal_sources.done',
  },
  exec_command: { running: 'copilot.tool.exec_command', done: 'copilot.tool.exec_command.done' },
  shell: { running: 'copilot.tool.exec_command', done: 'copilot.tool.exec_command.done' },
  apply_patch: { running: 'copilot.tool.apply_patch', done: 'copilot.tool.apply_patch.done' },
  view_image: { running: 'copilot.tool.view_image', done: 'copilot.tool.view_image.done' },
}

type Rec = Record<string, unknown>

function rec(value: unknown): Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : {}
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function list(value: unknown): Rec[] {
  return Array.isArray(value) ? value.map(rec) : []
}

/** Tool output may already have been truncated server-side into a JSON string. */
function parsed(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

const SUMMARY_MAX = 96

function firstLine(value: string): string {
  const line = value.split('\n').find((l) => l.trim()) ?? ''
  return line.length > SUMMARY_MAX ? `${line.slice(0, SUMMARY_MAX - 1)}…` : line
}

/** The one argument worth showing next to the tool name; the rest waits behind the chevron. */
function argumentSummary(name: string, input: Rec): string | null {
  switch (name) {
    case 'get_requirement_details':
      return str(input['requirementId']) ?? null
    case 'read_document_text':
      return str(input['filename']) ?? str(input['uploadId']) ?? null
    case 'search_legal_sources':
      return str(input['query']) ?? str(input['question']) ?? null
    case 'exec_command':
    case 'shell': {
      const command = input['cmd'] ?? input['command'] ?? input['commands']
      if (typeof command === 'string') return firstLine(command)
      if (Array.isArray(command)) return firstLine(command.map(String).join(' '))
      return null
    }
    case 'apply_patch': {
      const patch = str(input['patch']) ?? str(input['input']) ?? ''
      const files = [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => m[1])
      return files.length > 0 ? files.join(', ') : null
    }
    case 'view_image':
      return str(input['path']) ?? null
    default: {
      const keys = Object.keys(input)
      if (keys.length === 0) return null
      return firstLine(JSON.stringify(input))
    }
  }
}

/**
 * One tool call as a single quiet line: chevron, what happened, the key argument. The label
 * shimmers while the call runs; opening the row shows the arguments and the result. The row is
 * always collapsed by default, whether the call succeeded or failed.
 */
export function ToolCallWidget({ call }: { call: ChatToolCall }) {
  const { t } = useI18n()
  const labels = TOOL_LABEL[call.name]
  const running = call.status === 'running'
  const failed = call.status === 'failed'
  const label = labels ? t(running ? labels.running : labels.done) : humanize(call.name)
  const input = rec(call.input)
  const summary = argumentSummary(call.name, input)
  const output = parsed(call.output)
  const body = running ? null : widgetFor(call.name, input, output)
  const hasInput = call.input !== undefined && call.input !== null && Object.keys(input).length > 0

  return (
    <Collapsible defaultOpen={false} className="group/tool w-full">
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-start text-sm text-muted-foreground',
          'transition-colors hover:bg-muted/60 hover:text-foreground',
          failed && 'text-destructive hover:text-destructive',
        )}
      >
        <ChevronRightIcon
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-200 rtl:-scale-x-100',
            'group-data-open/tool:rotate-90 rtl:group-data-open/tool:-rotate-90',
          )}
        />
        {running ? (
          <Shimmer as="span" className="shrink-0 text-sm">
            {label}
          </Shimmer>
        ) : (
          <span className="shrink-0">{label}</span>
        )}
        {summary ? (
          <code className="min-w-0 truncate font-mono text-xs text-muted-foreground/80">{summary}</code>
        ) : null}
        {failed ? <XCircleIcon className="ms-auto size-3.5 shrink-0" /> : null}
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'overflow-hidden transition-[height,opacity] duration-200 ease-out',
          'h-[var(--collapsible-panel-height)] data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0',
        )}
      >
        <div className="ms-[13px] flex flex-col gap-3 border-s ps-4 pt-1.5 pb-2">
          {body ?? (
            <>
              {hasInput ? (
                <ToolSection title={t('copilot.tool.arguments')}>
                  <pre className="max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                    {JSON.stringify(input, null, 2)}
                  </pre>
                </ToolSection>
              ) : null}
              {running ? null : (
                <ToolSection title={failed ? t('copilot.tool.failed') : t('copilot.tool.result')}>
                  <pre
                    className={cn(
                      'max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap',
                      failed ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
                  </pre>
                </ToolSection>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ToolSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
        {title}
      </span>
      {children}
    </div>
  )
}

function widgetFor(name: string, input: Rec, output: unknown): React.ReactNode | null {
  const data = rec(output)
  if (str(data['error'])) return null
  switch (name) {
    case 'get_project_overview':
      return <ProjectOverviewWidget data={data} />
    case 'get_requirement_details':
      return <RequirementWidget data={data} />
    case 'list_project_documents':
      return <DocumentsWidget documents={list(data['documents'])} />
    case 'read_document_text':
      return <DocumentExcerptWidget data={data} />
    case 'search_legal_sources':
      return <LegalSourcesWidget data={data} />
    case 'exec_command':
    case 'shell':
      return <TerminalWidget input={input} output={output} />
    case 'apply_patch':
      return <PatchWidget input={input} output={output} />
    default:
      return null
  }
}

const STEP_ICON = {
  done: CheckCircle2Icon,
  current: CircleDotIcon,
  upcoming: CircleIcon,
} as const

function ProjectOverviewWidget({ data }: { data: Rec }) {
  const { t } = useI18n()
  const requirements = list(data['requirements'])
  const steps = list(data['steps'])
  const documents = list(data['documents'])
  const status = str(data['procedureStatus']) as ProcedureStatus | undefined
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{str(data['name'])}</span>
        <Badge variant="outline">{str(data['destination'])}</Badge>
        {status ? <ProcedureStatusBadge status={status} /> : null}
      </div>
      {steps.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">{t('copilot.widget.steps')}</h4>
          <ol className="flex flex-col gap-1">
            {steps.map((step) => {
              const state = (str(step['state']) ?? 'upcoming') as keyof typeof STEP_ICON
              const Icon = STEP_ICON[state] ?? CircleIcon
              return (
                <li
                  key={str(step['step'])}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    state === 'upcoming' && 'text-muted-foreground',
                    state === 'current' && 'font-medium',
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', state === 'done' && 'text-primary')} />
                  <span className="truncate">{t(stepTitle(str(step['step']) as ProcedureStep))}</span>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}
      {requirements.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            {t('copilot.widget.requirements')}
          </h4>
          <ul className="flex flex-col divide-y rounded-md border">
            {requirements.map((requirement) => (
              <RequirementRow key={str(requirement['id'])} requirement={requirement} />
            ))}
          </ul>
        </section>
      ) : null}
      {documents.length > 0 ? <DocumentsWidget documents={documents} /> : null}
    </div>
  )
}

function RequirementRow({ requirement }: { requirement: Rec }) {
  const { t } = useI18n()
  const id = str(requirement['id']) ?? ''
  const status = str(requirement['status']) as RequirementStatus | undefined
  const upload = rec(requirement['upload'])
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{t(requirementLabel(id))}</span>
        {str(upload['filename']) ? (
          <span className="truncate text-xs text-muted-foreground">{str(upload['filename'])}</span>
        ) : null}
      </div>
      {status ? <RequirementStatusBadge status={status} className="shrink-0" /> : null}
    </li>
  )
}

function RequirementWidget({ data }: { data: Rec }) {
  const { t } = useI18n()
  const definition = rec(data['definition'])
  const state = rec(data['state'])
  const id = str(definition['id']) ?? str(state['id']) ?? ''
  const status = str(state['status']) as RequirementStatus | undefined
  const fields = list(data['fields'])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t(requirementLabel(id))}</span>
        {str(definition['type']) ? (
          <Badge variant="outline">{humanize(str(definition['type'])!)}</Badge>
        ) : null}
        {status ? <RequirementStatusBadge status={status} /> : null}
      </div>
      {str(definition['notes']) ? (
        <p className="text-sm text-muted-foreground">{str(definition['notes'])}</p>
      ) : null}
      {fields.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {fields.map((field) => (
            <Badge key={str(field['key']) ?? str(field['id'])} variant="secondary">
              {str(field['label']) ?? humanize(str(field['key']) ?? str(field['id']) ?? '')}
            </Badge>
          ))}
        </ul>
      ) : null}
      {str(state['note']) ? <p className="text-sm">{str(state['note'])}</p> : null}
    </div>
  )
}

function DocumentsWidget({ documents }: { documents: Rec[] }) {
  const { t } = useI18n()
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('copilot.widget.noDocuments')}</p>
  }
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-xs font-medium text-muted-foreground uppercase">{t('copilot.widget.documents')}</h4>
      <ul className="flex flex-col divide-y rounded-md border">
        {documents.map((document) => {
          const pages = document['pageCount']
          const status = str(document['status']) as UploadStatus | undefined
          const id = str(document['id'])
          return (
            <li key={id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col items-start">
                {id ? (
                  <FileChip
                    fileRef={{ kind: 'document', uploadId: id }}
                    className="border-0 bg-transparent px-0 py-0 text-sm hover:bg-transparent hover:underline"
                  >
                    {str(document['filename'])}
                  </FileChip>
                ) : (
                  <span className="truncate">{str(document['filename'])}</span>
                )}
                {typeof pages === 'number' ? (
                  <span className="text-xs text-muted-foreground">
                    {t('copilot.widget.pages', { count: pages })}
                  </span>
                ) : null}
              </div>
              {status ? <UploadStatusBadge status={status} /> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function DocumentExcerptWidget({ data }: { data: Rec }) {
  const { t } = useI18n()
  const text = str(data['text']) ?? ''
  const offset = typeof data['offset'] === 'number' ? data['offset'] : 0
  const total = typeof data['totalChars'] === 'number' ? data['totalChars'] : text.length
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {str(data['uploadId']) ? (
          <FileChip fileRef={{ kind: 'document', uploadId: str(data['uploadId'])! }}>
            {str(data['filename'])}
          </FileChip>
        ) : (
          <>
            <FileTextIcon className="size-4 text-muted-foreground" />
            <span className="font-medium">{str(data['filename'])}</span>
          </>
        )}
        <span className="text-xs text-muted-foreground">
          {t('copilot.widget.excerpt', { from: offset, to: offset + text.length, total })}
        </span>
      </div>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{text}</pre>
    </div>
  )
}

function LegalSourcesWidget({ data }: { data: Rec }) {
  const { t } = useI18n()
  const passages = list(data['passages'])
  const needsReview = data['needsReview'] === true
  return (
    <div className="flex flex-col gap-3">
      {needsReview ? (
        <Alert>
          <ScaleIcon />
          <AlertTitle>{t('copilot.widget.needsReview')}</AlertTitle>
          <AlertDescription>{t('copilot.widget.needsReviewDescription')}</AlertDescription>
        </Alert>
      ) : null}
      {passages.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {passages.map((passage, index) => (
            <li
              key={str(passage['reference']) ?? index}
              className="flex flex-col gap-1 rounded-md border p-3"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{index + 1}</Badge>
                <span className="truncate">{str(passage['source']) ?? str(passage['reference'])}</span>
              </div>
              <p className="text-sm">{str(passage['fact'])}</p>
              {str(passage['excerpt']) && str(passage['excerpt']) !== str(passage['fact']) ? (
                <blockquote className="border-s-2 ps-2 text-xs text-muted-foreground">
                  {str(passage['excerpt'])}
                </blockquote>
              ) : null}
            </li>
          ))}
        </ol>
      ) : !needsReview ? (
        <p className="text-sm text-muted-foreground">{t('copilot.widget.noPassages')}</p>
      ) : null}
    </div>
  )
}

function TerminalWidget({ input, output }: { input: Rec; output: unknown }) {
  const { t } = useI18n()
  const command =
    str(input['cmd']) ??
    str(input['command']) ??
    (Array.isArray(input['commands']) ? input['commands'].map(String).join('\n') : undefined) ??
    JSON.stringify(input)
  const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase">
        {t('copilot.widget.command')}
      </span>
      <CodeBlock code={command} language="bash" />
      {text ? (
        <>
          <span className="text-xs font-medium text-muted-foreground uppercase">
            {t('copilot.widget.output')}
          </span>
          <CodeBlock code={text} language={'text' as never} />
        </>
      ) : null}
    </div>
  )
}

function PatchWidget({ input, output }: { input: Rec; output: unknown }) {
  const patch = str(input['patch']) ?? str(input['input']) ?? JSON.stringify(input, null, 2)
  const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  return (
    <div className="flex flex-col gap-2">
      <CodeBlock code={patch} language="diff" />
      {text ? <p className="text-xs text-muted-foreground">{text}</p> : null}
    </div>
  )
}
