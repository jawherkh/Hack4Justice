import * as React from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { ArrowRight, Check, Mail, Plus, Search } from 'lucide-react'
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@hack4justice/ui/components/avatar'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@hack4justice/ui/components/card'
import { Input } from '@hack4justice/ui/components/input'
import { Label } from '@hack4justice/ui/components/label'
import { Separator } from '@hack4justice/ui/components/separator'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { ChatShowcase } from '#/components/showcase/chat'
import { FormsShowcase } from '#/components/showcase/forms'
import { NavigationShowcase } from '#/components/showcase/navigation'
import { OverlaysShowcase } from '#/components/showcase/overlays'
import { Row, Section } from '#/components/showcase/primitives'

export const Route = createFileRoute('/{-$locale}/design-system')({
  // Internal reference page: development builds only.
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  head: () => ({ meta: [{ title: 'Design system · Hack4Justice' }] }),
  component: DesignSystem,
})

const BUTTON_VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'link',
] as const

const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg'] as const

const BADGE_VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'link',
] as const

const COLOR_TOKENS = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['accent', 'accent-foreground'],
  ['muted', 'muted-foreground'],
  ['destructive', 'background'],
  ['border', 'foreground'],
] as const

const CHART_TOKENS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

function DesignSystem() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Design system</h1>
        <p className="text-muted-foreground">
          Every component exported from <code>@hack4justice/ui</code>, in every
          variant. Internal reference page.
        </p>
      </div>

      <Section title="Colors" description="Semantic tokens from globals.css.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COLOR_TOKENS.map(([bg, fg]) => (
            <div
              key={bg}
              className="flex h-16 items-end rounded-lg border p-2 text-xs font-medium"
              style={{
                backgroundColor: `var(--${bg})`,
                color: `var(--${fg})`,
              }}
            >
              {bg}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {CHART_TOKENS.map((token) => (
            <div
              key={token}
              className="h-10 flex-1 rounded-md"
              style={{ backgroundColor: `var(--${token})` }}
              title={token}
            />
          ))}
        </div>
      </Section>

      <Section title="Typography" description="System font stack, SF Pro on Apple platforms.">
        <div className="flex flex-col gap-3">
          <p className="text-4xl font-bold tracking-tight">Heading 1</p>
          <p className="text-3xl font-bold tracking-tight">Heading 2</p>
          <p className="text-2xl font-semibold tracking-tight">Heading 3</p>
          <p className="text-xl font-semibold">Heading 4</p>
          <p className="text-base">
            Body. The quick brown fox jumps over the lazy dog. 0123456789
          </p>
          <p className="text-sm text-muted-foreground">
            Small muted. The quick brown fox jumps over the lazy dog.
          </p>
          <p className="font-mono text-sm">Mono: const justice = await serve()</p>
        </div>
      </Section>

      <Section title="Button" description="Variants, sizes, icons, states.">
        <Row label="Variants">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </Row>
        <Row label="Sizes">
          {BUTTON_SIZES.map((size) => (
            <Button key={size} size={size}>
              {size}
            </Button>
          ))}
        </Row>
        <Row label="Icons">
          <Button>
            <Plus data-icon="inline-start" />
            New case
          </Button>
          <Button variant="outline">
            Continue
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button size="icon" aria-label="Search">
            <Search />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Confirm">
            <Check />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Add">
            <Plus />
          </Button>
        </Row>
        <Row label="States">
          <Button disabled>Disabled</Button>
          <Button variant="outline" disabled>
            Disabled outline
          </Button>
          <Button aria-invalid>Invalid</Button>
        </Row>
      </Section>

      <Section title="Badge" description="Status and category labels.">
        <Row label="Variants">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </Row>
        <Row label="With icon">
          <Badge>
            <Check data-icon="inline-start" />
            Verified
          </Badge>
          <Badge variant="secondary">
            <Mail data-icon="inline-start" />
            3 new
          </Badge>
        </Row>
      </Section>

      <Section title="Card" description="Default and small sizes, with action and footer.">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Case #1042</CardTitle>
              <CardDescription>Opened 3 days ago, awaiting review.</CardDescription>
              <CardAction>
                <Badge variant="secondary">Pending</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p>
                Card content uses the default spacing. Body copy is small and
                inherits the card foreground colour.
              </p>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button variant="ghost" size="sm">
                Dismiss
              </Button>
              <Button size="sm">Review</Button>
            </CardFooter>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Small card</CardTitle>
              <CardDescription>Tighter spacing via size="sm".</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Useful for dense lists and sidebars.</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Input & Label" description="Text fields and their states.">
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Default" htmlFor="ds-default">
            <Input id="ds-default" placeholder="Enter a value" />
          </Field>
          <Field label="With value" htmlFor="ds-value">
            <Input id="ds-value" defaultValue="User" />
          </Field>
          <Field label="Disabled" htmlFor="ds-disabled">
            <Input id="ds-disabled" placeholder="Disabled" disabled />
          </Field>
          <Field label="Invalid" htmlFor="ds-invalid">
            <Input id="ds-invalid" defaultValue="not-an-email" aria-invalid />
          </Field>
          <Field label="Email" htmlFor="ds-email">
            <Input id="ds-email" type="email" placeholder="you@example.com" />
          </Field>
          <Field label="File" htmlFor="ds-file">
            <Input id="ds-file" type="file" />
          </Field>
        </div>
      </Section>

      <Section title="Avatar" description="Sizes, fallback, status badge, groups.">
        <Row label="Sizes">
          <Avatar size="sm">
            <AvatarImage src="https://github.com/shadcn.png" alt="" />
            <AvatarFallback>SM</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarImage src="https://github.com/shadcn.png" alt="" />
            <AvatarFallback>MD</AvatarFallback>
          </Avatar>
          <Avatar size="lg">
            <AvatarImage src="https://github.com/shadcn.png" alt="" />
            <AvatarFallback>LG</AvatarFallback>
          </Avatar>
        </Row>
        <Row label="Fallback & badge">
          <Avatar>
            <AvatarFallback>AB</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>AB</AvatarFallback>
            <AvatarBadge />
          </Avatar>
          <Avatar size="lg">
            <AvatarFallback>AB</AvatarFallback>
            <AvatarBadge>
              <Check />
            </AvatarBadge>
          </Avatar>
        </Row>
        <Row label="Group">
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>CD</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>EF</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
        </Row>
      </Section>

      <Section title="Separator" description="Horizontal and vertical dividers.">
        <div className="flex flex-col gap-4">
          <p className="text-sm">Above</p>
          <Separator />
          <p className="text-sm">Below</p>
          <div className="flex h-6 items-center gap-4 text-sm">
            <span>Home</span>
            <Separator orientation="vertical" />
            <span>About</span>
            <Separator orientation="vertical" />
            <span>Login</span>
          </div>
        </div>
      </Section>

      <Section title="Skeleton" description="Loading placeholders.">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-24 w-full max-w-md rounded-xl" />
      </Section>

      <FormsShowcase />
      <NavigationShowcase />
      <OverlaysShowcase />
      <ChatShowcase />
    </main>
  )
}



function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
