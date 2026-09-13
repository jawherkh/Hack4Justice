import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@hack4justice/ui/components/input-group'
import { Badge } from '@hack4justice/ui/components/badge'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hack4justice/ui/components/table'
import { adminKeys, listUsers } from '#/lib/admin'
import { formatDate } from '#/lib/format'

export const Route = createFileRoute('/_app/users/')({ component: UsersPage })

function UsersPage() {
  const [search, setSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(id)
  }, [search])
  const users = useQuery({ queryKey: adminKeys.users(debounced), queryFn: () => listUsers(debounced) })

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">End users of the Dalil web app.</p>
        </div>
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </header>
      {users.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-end">Projects</TableHead>
                <TableHead className="text-end">Submissions</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <Link to="/users/$id" params={{ id: u.id }} className="hover:underline">
                      {u.name}
                    </Link>
                    {u.banned ? (
                      <Badge variant="destructive" className="ms-2">
                        Banned
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-end tabular-nums">{u.projects}</TableCell>
                  <TableCell className="text-end tabular-nums">{u.submissions}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                </TableRow>
              ))}
              {users.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No users match.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
