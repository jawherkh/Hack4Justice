import { cn } from '@hack4justice/ui/lib/utils'

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-8 shrink-0 items-center', className)}>
      <span className="sr-only">Dalil</span>
      <img
        src="/brand/dalil-lockup-en.svg"
        alt=""
        aria-hidden="true"
        className="h-full w-auto dark:hidden"
        draggable={false}
      />
      <img
        src="/brand/dalil-lockup-en-dark.svg"
        alt=""
        aria-hidden="true"
        className="hidden h-full w-auto dark:block"
        draggable={false}
      />
    </span>
  )
}
