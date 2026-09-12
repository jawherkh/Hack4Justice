import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hack4justice/ui/components/table'
import { toLocaleParam, useI18n } from '#/i18n'
import { formatBytes, formatDate } from '#/lib/format'
import { listUploads } from '#/lib/uploads'
import { UploadStatusBadge } from './upload-status-badge'

export function UploadsTable() {
  const { t, locale } = useI18n()
  const uploads = useQuery({ queryKey: ['uploads'], queryFn: listUploads })

  if (uploads.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  if (uploads.isError) {
    return <p className="text-sm text-destructive">{t('uploads.loadError')}</p>
  }

  if (uploads.data.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>{t('uploads.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('uploads.empty.description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('uploads.table.file')}</TableHead>
          <TableHead>{t('uploads.table.status')}</TableHead>
          <TableHead className="text-end">{t('uploads.table.pages')}</TableHead>
          <TableHead className="text-end">{t('uploads.table.size')}</TableHead>
          <TableHead>{t('uploads.table.date')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {uploads.data.map((upload) => (
          <TableRow key={upload.id}>
            <TableCell className="font-medium">
              <Link
                to="/{-$locale}/uploads/$id"
                params={{ locale: toLocaleParam(locale), id: upload.id }}
                className="hover:underline"
              >
                {upload.filename}
              </Link>
            </TableCell>
            <TableCell>
              <UploadStatusBadge status={upload.status} />
            </TableCell>
            <TableCell className="text-end">{upload.pageCount ?? '–'}</TableCell>
            <TableCell className="text-end">{formatBytes(upload.size, locale)}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(upload.createdAt, locale)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
