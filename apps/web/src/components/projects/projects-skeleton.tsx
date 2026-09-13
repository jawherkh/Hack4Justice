import { Skeleton } from '@hack4justice/ui/components/skeleton'
import type { ViewMode } from './view-mode'

export function ProjectsSkeleton({ view }: { view: ViewMode }) {
  if (view === 'list') {
    return (
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="h-10 bg-muted/40" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <Skeleton className="h-9 w-14 rounded-md" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="hidden h-4 w-28 md:block" />
            <Skeleton className="hidden h-4 w-20 sm:block" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="flex flex-col gap-2 px-5 pt-4 pb-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="px-5 pb-4">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
