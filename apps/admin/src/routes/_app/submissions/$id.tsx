import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { AdminPermission, SubmissionStatus, can, type AdminRole } from '@hack4justice/shared'
import { ArrowLeft, Check, Eye, FileText, X } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Field, FieldLabel } from '@hack4justice/ui/components/field'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { Textarea } from '@hack4justice/ui/components/textarea'
import { toast } from '@hack4justice/ui/components/toast'
import { StatusBadge } from '#/components/status-badge'
import { adminKeys, getSubmission, reviewSubmission } from '#/lib/admin'
import { ApiError } from '#/lib/api'
import { formatBytes, formatDate, humanize } from '#/lib/format'

export const Route = createFileRoute('/_app/submissions/$id')({ component: SubmissionPage })

function SubmissionPage() {
  const { id } = Route.useParams()
  const { session } = Route.useRouteContext()
  const role = (session.user.role ?? 'support') as AdminRole
  const canReview = can(role, AdminPermission.REVIEW_SUBMISSIONS)
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: adminKeys.submission(id), queryFn: () => getSubmission(id) })
  const [note, setNote] = React.useState('')

  const review = useMutation({
    mutationFn: (status: SubmissionStatus) =>
      reviewSubmission(id, { status, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast.add({ type: 'success', title: 'Submission updated and user notified.' })
    },
    onError: (err) =>
      toast.add({ type: 'error', title: err instanceof ApiError ? err.message : 'Could not update.' }),
  })

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/submissions"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Submissions
      </Link>
      {detail.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : detail.isError ? (
        <p className="text-sm text-destructive">Could not load this submission.</p>
      ) : (
        (() => {
          const { submission, project, user, evidence, reviewer } = detail.data
          const fileById = new Map(evidence.map((f) => [f.id, f]))
          return (
            <>
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-mono text-2xl font-bold tracking-tight">{submission.reference}</h1>
                    <StatusBadge status={submission.status} />
                  </div>
                  <p className="text-sm">
                    <Badge variant="secondary" className="me-2">
                      {project.destination}
                    </Badge>
                    <span className="font-medium">{project.name}</span>
                    <span className="text-muted-foreground"> · {humanize(submission.serviceId)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <Link to="/users/$id" params={{ id: user.id }} className="hover:underline">
                      {user.name}
                    </Link>{' '}
                    · {user.email} · submitted {formatDate(submission.submittedAt)}
                    {submission.receipt ? ` · receipt ${submission.receipt}` : ''}
                  </p>
                  {submission.note ? (
                    <p className="text-sm text-muted-foreground">“{submission.note}”</p>
                  ) : null}
                </div>
              </header>

              <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
                <Card>
                  <CardHeader>
                    <CardTitle>Dossier contents</CardTitle>
                    <CardDescription>Checklist as frozen at submission time.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ol className="divide-y rounded-lg border">
                      {submission.snapshot.requirements.map((r, index) => {
                        const file = r.upload ? fileById.get(r.upload.id) : undefined
                        return (
                          <li key={r.requirementId} className="flex flex-col gap-2 px-3 py-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground">{index + 1}.</span>
                              <span className="font-medium">{humanize(r.requirementId)}</span>
                              <StatusBadge status={r.status} />
                            </div>
                            {r.upload ? (
                              <div className="flex flex-wrap items-center gap-2 ps-5">
                                <FileText className="size-4 text-muted-foreground" />
                                <span>{r.upload.filename}</span>
                                {file ? (
                                  <>
                                    <span className="text-xs text-muted-foreground">
                                      {formatBytes(file.size)}
                                    </span>
                                    <Button
                                      variant="outline"
                                      size="xs"
                                      render={
                                        <a
                                          href={file.downloadUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        />
                                      }
                                    >
                                      <Eye data-icon="inline-start" />
                                      Open
                                    </Button>
                                  </>
                                ) : (
                                  <span className="text-xs text-destructive">file no longer available</span>
                                )}
                              </div>
                            ) : null}
                            {r.value ? (
                              <dl className="grid gap-x-4 gap-y-1 ps-5 sm:grid-cols-[12rem_1fr]">
                                {Object.entries(r.value).map(([key, value]) => (
                                  <React.Fragment key={key}>
                                    <dt className="text-muted-foreground">
                                      {humanize(key.replace(/([A-Z])/g, '_$1'))}
                                    </dt>
                                    <dd className="break-words">{value}</dd>
                                  </React.Fragment>
                                ))}
                              </dl>
                            ) : null}
                            {r.note ? <p className="ps-5 text-xs text-muted-foreground">{r.note}</p> : null}
                          </li>
                        )
                      })}
                    </ol>
                  </CardContent>
                </Card>

                <Card className="self-start">
                  <CardHeader>
                    <CardTitle>Review</CardTitle>
                    <CardDescription>
                      {reviewer
                        ? `Last reviewed by ${reviewer.name}${submission.reviewedAt ? ` on ${formatDate(submission.reviewedAt)}` : ''}.`
                        : 'Not reviewed yet.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {submission.reviewNote ? (
                      <p className="rounded-lg bg-muted p-3 text-sm">{submission.reviewNote}</p>
                    ) : null}
                    {canReview ? (
                      <>
                        <Field>
                          <FieldLabel htmlFor="review-note">Note to the user</FieldLabel>
                          <Textarea
                            id="review-note"
                            rows={3}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Reason for rejection, missing piece, next step…"
                          />
                        </Field>
                        <div className="flex flex-col gap-2">
                          {submission.status === 'SUBMITTED' ? (
                            <Button
                              variant="secondary"
                              disabled={review.isPending}
                              onClick={() => review.mutate(SubmissionStatus.UNDER_REVIEW)}
                            >
                              {review.isPending ? <Spinner data-icon="inline-start" /> : null}
                              Mark under review
                            </Button>
                          ) : null}
                          <Button
                            disabled={review.isPending || submission.status === 'ACCEPTED'}
                            onClick={() => review.mutate(SubmissionStatus.ACCEPTED)}
                          >
                            <Check data-icon="inline-start" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            disabled={review.isPending || submission.status === 'REJECTED'}
                            onClick={() => review.mutate(SubmissionStatus.REJECTED)}
                          >
                            <X data-icon="inline-start" />
                            Reject
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          The user is notified in the app; a rejection sends them back to preparation with
                          your note.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Your role is read-only. An admin can approve or reject.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )
        })()
      )}
    </div>
  )
}
