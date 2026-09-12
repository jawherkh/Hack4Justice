import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@hack4justice/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@hack4justice/ui/components/card'
import { Badge } from '@hack4justice/ui/components/badge'
import { fetchHello, fetchItems } from '../lib/api'

export const Route = createFileRoute('/')({ component: Home })

async function queryHello() {
  return fetchHello()
}

async function queryItems() {
  return fetchItems({ page: 1, limit: 3 })
}

function ApiStatus() {
  const hello = useQuery({ queryKey: ['hello'], queryFn: queryHello })
  const items = useQuery({ queryKey: ['items'], queryFn: queryItems })

  if (hello.isPending || items.isPending) {
    return <p className="text-sm text-muted-foreground">Contacting API…</p>
  }

  if (hello.isError || items.isError) {
    return (
      <p className="text-sm text-destructive">
        API unreachable. Start it with{' '}
        <code>pnpm --filter @hack4justice/api run dev</code>.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <code>/api/v1/hello</code> → {hello.data.message}
      </p>
      <p className="text-sm">
        <code>/api/v1/items</code> → {items.data.data.join(', ')} (page{' '}
        {items.data.meta.page} of {items.data.meta.totalPages})
      </p>
    </div>
  )
}

function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to Hack4Justice
        </h1>
        <p className="text-muted-foreground">
          TanStack Start + Turborepo + shared shadcn design system.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Design system wired</CardTitle>
          <CardDescription>
            Components imported from{' '}
            <code>@hack4justice/ui</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button>Get started</Button>
          <Button variant="outline">Documentation</Button>
          <Badge variant="secondary">ui package</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Elysia RPC via Eden</CardTitle>
          <CardDescription>
            End-to-end type-safe queries with React Query. Types flow from{' '}
            <code>@hack4justice/api</code> — no codegen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiStatus />
        </CardContent>
      </Card>
    </main>
  )
}
