import { createFileRoute } from '@tanstack/react-router'
import { UploadDropzone } from '#/components/uploads/upload-dropzone'
import { UploadsTable } from '#/components/uploads/uploads-table'
import { useTranslation } from '#/i18n'
import { requireAuth } from '#/lib/guards'

export const Route = createFileRoute('/{-$locale}/uploads/')({
  beforeLoad: requireAuth,
  component: Uploads,
})

function Uploads() {
  const t = useTranslation()
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('uploads.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('uploads.description')}</p>
      </div>
      <UploadDropzone />
      <UploadsTable />
    </main>
  )
}
