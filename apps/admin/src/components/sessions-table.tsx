import { Button } from '@hack4justice/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hack4justice/ui/components/table'
import { formatDate } from '#/lib/format'

export interface SessionLike {
  id: string
  createdAt: string | Date
  updatedAt: string | Date
  expiresAt: string | Date
  ipAddress?: string | null
  userAgent?: string | null
}

interface SessionsTableProps {
  sessions: SessionLike[]
  currentId?: string
  onRevoke?: (id: string) => void
  busy?: boolean
}

/** Compact UA: "Chrome on macOS" style, without a parser dependency. */
function describeAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser'
  const os = /Mac OS X/.test(ua)
    ? 'macOS'
    : /Windows/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown OS'
  return `${browser} on ${os}`
}

export function SessionsTable({ sessions, currentId, onRevoke, busy }: SessionsTableProps) {
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">No active sessions.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Device</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>Last active</TableHead>
          <TableHead>Expires</TableHead>
          {onRevoke ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">
              {describeAgent(s.userAgent)}
              {s.id === currentId ? <span className="ms-2 text-xs text-primary">this session</span> : null}
            </TableCell>
            <TableCell className="text-muted-foreground">{s.ipAddress ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(s.updatedAt)}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(s.expiresAt)}</TableCell>
            {onRevoke ? (
              <TableCell className="text-end">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={busy || s.id === currentId}
                  onClick={() => onRevoke(s.id)}
                >
                  Revoke
                </Button>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
