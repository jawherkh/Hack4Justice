import { Skeleton } from '@hack4justice/ui/components/skeleton'
import type { ViewMode } from './view-mode'

export function ProjectsSkeleton({ view }: { view: ViewMode }) {
  if (view === 'list') {
    return (
      <div className="flex flex-col divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="hidden h-4 w-24 md:block" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
