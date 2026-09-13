import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { ADMIN_ROLES, AdminPermission, AdminRole, can } from '@hack4justice/shared'
import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Field, FieldGroup, FieldLabel } from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hack4justice/ui/components/select'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { Spinner } from '@hack4justice/ui/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hack4justice/ui/components/table'
import { toast } from '@hack4justice/ui/components/toast'
import { adminKeys, createStaff, deleteStaff, listStaff, updateStaff } from '#/lib/admin'
import { ApiError } from '#/lib/api'
import { formatDate } from '#/lib/format'

export const Route = createFileRoute('/_app/staff')({
  beforeLoad: ({ context }) => {
    const role = (context.session.user.role ?? 'support') as AdminRole
    if (!can(role, AdminPermission.MANAGE_STAFF)) throw redirect({ to: '/' })
  },
  component: StaffPage,
})

const roleItems = ADMIN_ROLES.map((value) => ({ value, label: value }))

function StaffPage() {
  const { session } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const staff = useQuery({ queryKey: adminKeys.staff, queryFn: listStaff })
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    role: AdminRole.SUPPORT as AdminRole,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminKeys.staff })
  const onError = (err: unknown) =>
    toast.add({ type: 'error', title: err instanceof ApiError ? err.message : 'Request failed.' })

  const create = useMutation({
    mutationFn: () => createStaff(form),
    onSuccess: async () => {
      await invalidate()
      setForm({ name: '', email: '', password: '', role: AdminRole.SUPPORT })
      toast.add({ type: 'success', title: 'Staff account created.' })
    },
    onError,
  })
  const setRole = useMutation({
    mutationFn: (input: { id: string; role: AdminRole }) => updateStaff(input.id, { role: input.role }),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({ mutationFn: deleteStaff, onSuccess: invalidate, onError })

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Support is read-only, admin can review submissions, superadmin also manages staff.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {staff.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.data?.map((member) => {
                    const self = member.id === session.user.id
                    return (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.name}
                          {self ? (
                            <Badge variant="outline" className="ms-2">
                              you
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{member.email}</TableCell>
                        <TableCell>
                          <Select
                            items={roleItems}
                            value={member.role}
                            disabled={self || setRole.isPending}
                            onValueChange={(value) =>
                              setRole.mutate({ id: member.id, role: value as AdminRole })
                            }
                          >
                            <SelectTrigger size="sm" className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(member.createdAt)}
                        </TableCell>
                        <TableCell className="text-end">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove"
                            disabled={self || remove.isPending}
                            onClick={() => remove.mutate(member.id)}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>New staff account</CardTitle>
            <CardDescription>
              Share the password out of band; there is no invitation email yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                create.mutate()
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="staff-name">Name</FieldLabel>
                  <Input
                    id="staff-name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-email">Email</FieldLabel>
                  <Input
                    id="staff-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-password">Password (10+ characters)</FieldLabel>
                  <Input
                    id="staff-password"
                    type="password"
                    required
                    minLength={10}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Role</FieldLabel>
                  <Select
                    items={roleItems}
                    value={form.role}
                    onValueChange={(value) => setForm({ ...form, role: value as AdminRole })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                Create account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
