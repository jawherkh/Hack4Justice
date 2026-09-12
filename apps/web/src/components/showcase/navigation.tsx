import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@hack4justice/ui/components/accordion'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@hack4justice/ui/components/alert'
import { AspectRatio } from '@hack4justice/ui/components/aspect-ratio'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@hack4justice/ui/components/breadcrumb'
import { Button } from '@hack4justice/ui/components/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@hack4justice/ui/components/carousel'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@hack4justice/ui/components/collapsible'
import { DirectionProvider, useDirection } from '@hack4justice/ui/components/direction'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@hack4justice/ui/components/item'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@hack4justice/ui/components/navigation-menu'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@hack4justice/ui/components/pagination'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@hack4justice/ui/components/progress'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@hack4justice/ui/components/resizable'
import { ScrollArea } from '@hack4justice/ui/components/scroll-area'
import { Spinner } from '@hack4justice/ui/components/spinner'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@hack4justice/ui/components/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@hack4justice/ui/components/tabs'
import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChevronsUpDownIcon,
  FileTextIcon,
  FolderOpenIcon,
  GavelIcon,
  InfoIcon,
  PlusIcon,
  ScaleIcon,
  UserIcon,
} from 'lucide-react'

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@hack4justice/ui/components/chart'
import { Row, Section } from '#/components/showcase/primitives'

const hearings = [
  { case: 'H4J-2026-0142', client: 'A. Haddad', lawyer: 'M. Ben Salah', date: '14 Sep 2026', court: 'Tunis First Instance' },
  { case: 'H4J-2026-0151', client: 'S. Trabelsi', lawyer: 'L. Gharbi', date: '16 Sep 2026', court: 'Sfax Court of Appeal' },
  { case: 'H4J-2026-0163', client: 'K. Mansour', lawyer: 'M. Ben Salah', date: '21 Sep 2026', court: 'Sousse Family Court' },
  { case: 'H4J-2026-0170', client: 'R. Jaziri', lawyer: 'N. Ayari', date: '28 Sep 2026', court: 'Tunis Labour Tribunal' },
]

const caseTimeline = [
  'Intake interview completed',
  'Eligibility for legal aid confirmed',
  'Lawyer M. Ben Salah assigned',
  'Power of attorney signed',
  'Complaint filed with the court',
  'First hearing scheduled',
  'Evidence bundle submitted',
  'Witness statements collected',
  'Second hearing held',
  'Judgment reserved',
  'Judgment delivered',
  'Appeal deadline noted',
]

function DirectionSample() {
  const direction = useDirection()

  return (
    <div dir={direction} className="flex w-full max-w-md flex-col gap-3 rounded-lg border p-4">
      <p className="text-xs text-muted-foreground uppercase">
        Direction: {direction}
      </p>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">القضايا</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#">قانون الأسرة</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>H4J-2026-0163</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-2">
        <Button>
          <PlusIcon data-icon="inline-start" />
          قضية جديدة
        </Button>
        <Button variant="outline">
          <CalendarIcon data-icon="inline-start" />
          جلسة
        </Button>
      </div>
    </div>
  )
}

const CASES_PER_MONTH = [
  { month: 'Jan', opened: 42, closed: 31 },
  { month: 'Feb', opened: 38, closed: 35 },
  { month: 'Mar', opened: 55, closed: 40 },
  { month: 'Apr', opened: 47, closed: 44 },
  { month: 'May', opened: 61, closed: 52 },
  { month: 'Jun', opened: 58, closed: 57 },
]

const casesChartConfig = {
  opened: { label: 'Opened', color: 'var(--chart-1)' },
  closed: { label: 'Closed', color: 'var(--chart-3)' },
} satisfies ChartConfig

export function NavigationShowcase() {
  return (
    <>
      <Section
        title="Accordion"
        description="Expandable sections for case details such as hearings, documents and notes."
      >
        <Accordion defaultValue={['hearings']} className="max-w-xl">
          <AccordionItem value="hearings">
            <AccordionTrigger>Upcoming hearings</AccordionTrigger>
            <AccordionContent>
              <p>
                Next hearing on 14 Sep 2026 at Tunis First Instance, presided by
                Judge R. Chaabane. Client must attend in person.
              </p>
              <p>A reminder will be sent to the client 48 hours before.</p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="documents">
            <AccordionTrigger>Case documents</AccordionTrigger>
            <AccordionContent>
              Complaint, power of attorney and evidence bundle have been filed.
              Witness statements are still pending.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="notes">
            <AccordionTrigger>Lawyer notes</AccordionTrigger>
            <AccordionContent>
              M. Ben Salah: client is eligible for full legal aid. Request the
              employer payroll records before the second hearing.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section
        title="Collapsible"
        description="Hide secondary information, such as older case activity, behind a trigger."
      >
        <Collapsible className="flex w-full max-w-md flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">3 archived hearings</p>
            <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" />}>
              <ChevronsUpDownIcon />
              <span className="sr-only">Toggle archived hearings</span>
            </CollapsibleTrigger>
          </div>
          <div className="rounded-lg border px-3 py-2 text-sm">
            12 Jun 2026 — Preliminary hearing, Tunis First Instance
          </div>
          <CollapsibleContent className="flex flex-col gap-2">
            <div className="rounded-lg border px-3 py-2 text-sm">
              03 Apr 2026 — Mediation session, adjourned
            </div>
            <div className="rounded-lg border px-3 py-2 text-sm">
              18 Feb 2026 — Intake review with L. Gharbi
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Section>

      <Section
        title="Tabs"
        description="Switch between views of a case without leaving the page."
      >
        <div className="flex flex-col gap-6">
          <Row label="Default">
            <Tabs defaultValue="overview" className="w-full max-w-md">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="hearings">Hearings</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                Labour dispute — unpaid wages. Client: A. Haddad. Assigned
                lawyer: M. Ben Salah.
              </TabsContent>
              <TabsContent value="hearings">
                2 hearings scheduled, next on 14 Sep 2026.
              </TabsContent>
              <TabsContent value="documents">
                5 documents filed, 1 awaiting client signature.
              </TabsContent>
            </Tabs>
          </Row>
          <Row label="Line">
            <Tabs defaultValue="active" className="w-full max-w-md">
              <TabsList variant="line">
                <TabsTrigger value="active">
                  <BriefcaseIcon data-icon="inline-start" />
                  Active
                </TabsTrigger>
                <TabsTrigger value="closed">
                  <GavelIcon data-icon="inline-start" />
                  Closed
                </TabsTrigger>
                <TabsTrigger value="archived" disabled>
                  Archived
                </TabsTrigger>
              </TabsList>
              <TabsContent value="active">18 active cases across 4 lawyers.</TabsContent>
              <TabsContent value="closed">42 cases closed this year.</TabsContent>
              <TabsContent value="archived">No archived cases.</TabsContent>
            </Tabs>
          </Row>
        </div>
      </Section>

      <Section
        title="Breadcrumb"
        description="Shows where the user is within the case hierarchy."
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Cases</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Labour law</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>H4J-2026-0142</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>

      <Section
        title="Pagination"
        description="Move between pages of a long case list."
      >
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">12</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Section>

      <Section
        title="Navigation Menu"
        description="Top-level navigation with dropdown panels for the case management app."
      >
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Cases</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-72 gap-1">
                  <li>
                    <NavigationMenuLink href="#">
                      <FolderOpenIcon />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">All cases</span>
                        <span className="text-muted-foreground">
                          Browse every open and closed file
                        </span>
                      </div>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink href="#">
                      <CalendarIcon />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">Hearings</span>
                        <span className="text-muted-foreground">
                          Court dates for the next 30 days
                        </span>
                      </div>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink href="#">
                      <FileTextIcon />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">Documents</span>
                        <span className="text-muted-foreground">
                          Filings, evidence and templates
                        </span>
                      </div>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Lawyers</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-56 gap-1">
                  <li>
                    <NavigationMenuLink href="#">
                      <UserIcon />
                      M. Ben Salah
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink href="#">
                      <UserIcon />
                      L. Gharbi
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink href="#">
                      <UserIcon />
                      N. Ayari
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
                Reports
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </Section>

      <Section
        title="Table"
        description="Tabular data such as the hearing schedule."
      >
        <Table>
          <TableCaption>Hearings scheduled for September 2026.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Lawyer</TableHead>
              <TableHead>Court</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hearings.map((hearing) => (
              <TableRow key={hearing.case}>
                <TableCell className="font-medium">{hearing.case}</TableCell>
                <TableCell>{hearing.client}</TableCell>
                <TableCell>{hearing.lawyer}</TableCell>
                <TableCell>{hearing.court}</TableCell>
                <TableCell className="text-right">{hearing.date}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>Total hearings</TableCell>
              <TableCell className="text-right">{hearings.length}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Section>

      <Section
        title="Scroll Area"
        description="A constrained, scrollable region for long lists like a case timeline."
      >
        <ScrollArea className="h-48 w-full max-w-sm rounded-lg border">
          <div className="flex flex-col gap-1 p-3">
            <p className="text-sm font-medium">Case H4J-2026-0142 timeline</p>
            {caseTimeline.map((step, index) => (
              <div
                key={step}
                className="flex items-center gap-2 border-b py-2 text-sm last:border-0"
              >
                <span className="text-xs text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {step}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Section>

      <Section
        title="Resizable"
        description="Adjustable split panes, for instance a case list beside its detail view."
      >
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-48 w-full max-w-2xl rounded-lg border"
        >
          <ResizablePanel defaultSize="35" minSize="20">
            <div className="flex h-full flex-col gap-2 p-4">
              <p className="text-sm font-medium">Cases</p>
              {hearings.map((hearing) => (
                <p key={hearing.case} className="text-sm text-muted-foreground">
                  {hearing.case}
                </p>
              ))}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="65" minSize="30">
            <div className="flex h-full flex-col gap-2 p-4">
              <p className="text-sm font-medium">H4J-2026-0142</p>
              <p className="text-sm text-muted-foreground">
                Labour dispute — unpaid wages. Client A. Haddad, represented by
                M. Ben Salah. Next hearing 14 Sep 2026.
              </p>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </Section>

      <Section
        title="Aspect Ratio"
        description="Keeps media such as scanned documents or courtroom photos at a fixed ratio."
      >
        <div className="w-full max-w-md">
          <AspectRatio
            ratio={16 / 9}
            className="flex items-center justify-center rounded-lg border bg-muted"
          >
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileTextIcon className="size-8" />
              <span className="text-sm">Scanned complaint — 16:9 preview</span>
            </div>
          </AspectRatio>
        </div>
      </Section>

      <Section
        title="Carousel"
        description="Step through a series of items such as this week's hearings."
      >
        <div className="px-12">
          <Carousel className="w-full max-w-sm">
            <CarouselContent>
              {hearings.map((hearing) => (
                <CarouselItem key={hearing.case}>
                  <div className="flex flex-col gap-2 rounded-lg border p-4">
                    <p className="text-sm font-medium">{hearing.case}</p>
                    <p className="text-sm text-muted-foreground">
                      {hearing.client} · {hearing.lawyer}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {hearing.court} — {hearing.date}
                    </p>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      </Section>

      <Section
        title="Chart"
        description="Recharts wrapped by ChartContainer, coloured from the chart tokens."
      >
        <ChartContainer config={casesChartConfig} className="h-64 w-full max-w-2xl">
          <BarChart data={CASES_PER_MONTH} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="opened" fill="var(--color-opened)" radius={4} />
            <Bar dataKey="closed" fill="var(--color-closed)" radius={4} />
          </BarChart>
        </ChartContainer>
      </Section>

      <Section
        title="Progress"
        description="Shows how far along a process is, such as case intake."
      >
        <div className="flex w-full max-w-md flex-col gap-4">
          <Progress value={62}>
            <ProgressLabel>Intake completed</ProgressLabel>
            <ProgressValue />
          </Progress>
          <Progress value={25}>
            <ProgressLabel>Documents collected</ProgressLabel>
            <ProgressValue />
          </Progress>
          <Progress value={null}>
            <ProgressLabel>Court response</ProgressLabel>
            <ProgressValue>{() => 'Pending'}</ProgressValue>
          </Progress>
        </div>
      </Section>

      <Section
        title="Spinner"
        description="Indicates loading state while cases or documents are fetched."
      >
        <div className="flex flex-col gap-6">
          <Row label="Sizes">
            <Spinner />
            <Spinner className="size-6" />
            <Spinner className="size-8" />
          </Row>
          <Row label="In buttons">
            <Button disabled>
              <Spinner data-icon="inline-start" />
              Loading cases
            </Button>
            <Button variant="outline" disabled>
              <Spinner data-icon="inline-start" />
              Uploading document
            </Button>
          </Row>
        </div>
      </Section>

      <Section
        title="Alert"
        description="Inline messages that call attention to case status or errors."
      >
        <div className="flex w-full max-w-xl flex-col gap-3">
          <Alert>
            <InfoIcon />
            <AlertTitle>Hearing rescheduled</AlertTitle>
            <AlertDescription>
              The hearing for H4J-2026-0151 has moved to 16 Sep 2026 at the
              Sfax Court of Appeal. The client has been notified.
            </AlertDescription>
          </Alert>
          <Alert>
            <ScaleIcon />
            <AlertTitle>Legal aid approved</AlertTitle>
            <AlertDescription>
              A. Haddad qualifies for full legal aid. Fees will be covered by
              the state programme.
            </AlertDescription>
            <AlertAction>
              <Button variant="outline" size="sm">
                View
              </Button>
            </AlertAction>
          </Alert>
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>Appeal deadline in 2 days</AlertTitle>
            <AlertDescription>
              The appeal for H4J-2026-0170 must be filed by 30 Sep 2026 or the
              judgment becomes final.
            </AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section
        title="Empty"
        description="Placeholder shown when a list has no content yet."
      >
        <Empty className="max-w-md border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpenIcon />
            </EmptyMedia>
            <EmptyTitle>No cases assigned</EmptyTitle>
            <EmptyDescription>
              You have not been assigned any cases yet. New cases will appear
              here once the intake team assigns them to you.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button>
              <PlusIcon data-icon="inline-start" />
              Create a case
            </Button>
          </EmptyContent>
        </Empty>
      </Section>

      <Section
        title="Item"
        description="A flexible list row with media, content and actions."
      >
        <ItemGroup className="max-w-xl">
          <Item variant="outline">
            <ItemMedia variant="icon">
              <GavelIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>H4J-2026-0142 — Unpaid wages</ItemTitle>
              <ItemDescription>
                Labour dispute for A. Haddad, assigned to M. Ben Salah. Next
                hearing on 14 Sep 2026.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm">
                Open
              </Button>
            </ItemActions>
          </Item>
          <ItemSeparator />
          <Item variant="muted">
            <ItemMedia variant="icon">
              <UserIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>L. Gharbi</ItemTitle>
              <ItemDescription>
                Family law specialist, 6 active cases, available for new
                assignments from October.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="ghost" size="sm">
                Assign
              </Button>
            </ItemActions>
          </Item>
        </ItemGroup>
      </Section>

      <Section
        title="Direction"
        description="DirectionProvider switches Base UI components to right-to-left layout for Arabic content."
      >
        <div className="flex flex-col gap-6">
          <Row label="LTR (default)">
            <DirectionProvider direction="ltr">
              <DirectionSample />
            </DirectionProvider>
          </Row>
          <Row label="RTL">
            <DirectionProvider direction="rtl">
              <DirectionSample />
            </DirectionProvider>
          </Row>
        </div>
      </Section>
    </>
  )
}
