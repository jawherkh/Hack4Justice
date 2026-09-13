import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FileExplorer } from '#/components/procedure/file-explorer'
import { useI18n } from '#/i18n'
import { getProject, projectKeys } from '#/lib/projects'

export const Route = createFileRoute('/{-$locale}/projects/$id/documents')({ component: Documents })

function Documents() {
  const { id } = Route.useParams()
  const { t } = useI18n()
  const project = useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) })
  if (!project.data) return null
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t('procedure.explorer.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('procedure.explorer.description')}</p>
      </header>
      <FileExplorer project={project.data} />
    </div>
  )
}
