import type { ProcedureStatus, ProcedureStep, RequirementStatus, UploadStatus } from '@hack4justice/shared'
import { CodeBlock } from '@hack4justice/ui/components/ai-elements/code-block'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from '@hack4justice/ui/components/ai-elements/tool'
import { Alert, AlertDescription, AlertTitle } from '@hack4justice/ui/components/alert'
import { Badge } from '@hack4justice/ui/components/badge'
import { cn } from '@hack4justice/ui/lib/utils'
import { CheckCircle2Icon, CircleDotIcon, CircleIcon, FileTextIcon, ScaleIcon } from 'lucide-react'
import { humanize, requirementLabel, stepTitle } from '#/components/procedure/labels'
import { ProcedureStatusBadge, RequirementStatusBadge } from '#/components/procedure/status-badges'
import { UploadStatusBadge } from '#/components/uploads/upload-status-badge'
import { useI18n, type MessageKey } from '#/i18n'
import type { ChatToolCall } from './use-copilot-chat'

const TOOL_STATE: Record<ChatToolCall['status'], ToolPart['state']> = {
  running: 'input-available',
  completed: 'output-available',
  failed: 'output-error',
}

const TOOL_LABEL: Record<string, MessageKey> = {
  get_project_overview: 'copilot.tool.get_project_overview',
  get_requirement_details: 'copilot.tool.get_requirement_details',
  list_project_documents: 'copilot.tool.list_project_documents',
  read_document_text: 'copilot.tool.read_document_text',
  search_legal_sources: 'copilot.tool.search_legal_sources',
  exec_command: 'copilot.tool.exec_command',
  shell: 'copilot.tool.exec_command',
  apply_patch: 'copilot.tool.apply_patch',
  view_image: 'copilot.tool.view_image',
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

/** One tool call of an assistant message, rendered as a collapsible card with a typed body. */
export function ToolCallWidget({ call, defaultOpen }: { call: ChatToolCall; defaultOpen?: boolean }) {
  const { t } = useI18n()
  const label = TOOL_LABEL[call.name]
  const output = parsed(call.output)
  const body = call.status === 'running' ? null : widgetFor(call.name, rec(call.input), output)
  return (
    <Tool className="mb-0" defaultOpen={defaultOpen ?? call.status === 'failed'}>
      <ToolHeader
        type="dynamic-tool"
        toolName={call.name}
        title={label ? t(label) : humanize(call.name)}
        state={TOOL_STATE[call.status]}
      />
      <ToolContent>
        {body ?? (
          <>
            {call.input !== undefined && call.input !== null ? <ToolInput input={call.input} /> : null}
            <ToolOutput
              output={call.status === 'running' ? undefined : (output as never)}
              errorText={call.status === 'failed' ? str(output) : undefined}
            />
          </>
        )}
      </ToolContent>
    </Tool>
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
          return (
            <li key={str(document['id'])} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{str(document['filename'])}</span>
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
        <FileTextIcon className="size-4 text-muted-foreground" />
        <span className="font-medium">{str(data['filename'])}</span>
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
