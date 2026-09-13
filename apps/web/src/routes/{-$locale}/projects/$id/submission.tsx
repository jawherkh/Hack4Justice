import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { SubmissionPanel } from '#/components/procedure/submission-panel'
import { useI18n } from '#/i18n'
import { getProject, projectKeys } from '#/lib/projects'

export const Route = createFileRoute('/{-$locale}/projects/$id/submission')({ component: Submission })

function Submission() {
  const { id } = Route.useParams()
  const { t } = useI18n()
  const project = useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) })
  if (!project.data) return null
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t('procedure.submission.title')}</h1>
      </header>
      <SubmissionPanel project={project.data} />
    </div>
  )
}
