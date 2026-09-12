import * as React from 'react'
import {
  ArchiveIcon,
  BellIcon,
  CalendarIcon,
  CopyIcon,
  FileTextIcon,
  FolderOpenIcon,
  InfoIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShareIcon,
  Trash2Icon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react'

import { Button } from '@hack4justice/ui/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@hack4justice/ui/components/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@hack4justice/ui/components/alert-dialog'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@hack4justice/ui/components/sheet'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@hack4justice/ui/components/drawer'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@hack4justice/ui/components/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@hack4justice/ui/components/tooltip'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@hack4justice/ui/components/hover-card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@hack4justice/ui/components/dropdown-menu'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@hack4justice/ui/components/context-menu'
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@hack4justice/ui/components/menubar'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@hack4justice/ui/components/command'
import { Toaster, toast } from '@hack4justice/ui/components/toast'
import { Kbd, KbdGroup } from '@hack4justice/ui/components/kbd'

import { Row, Section } from '#/components/showcase/primitives'

function DialogDemo() {
  return (
    <Row label="Basic">
      <Dialog>
        <DialogTrigger render={<Button variant="outline" />}>
          <PlusIcon data-icon="inline-start" />
          Add case note
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add case note</DialogTitle>
            <DialogDescription>
              Notes are visible to every advocate assigned to case #2024-HC-0417.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="case-note" className="text-sm font-medium">
              Note
            </label>
            <textarea
              id="case-note"
              rows={4}
              placeholder="Client confirmed eviction hearing is scheduled for 14 October."
              className="w-full rounded-lg border bg-transparent p-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <DialogClose render={<Button />}>Save note</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger render={<Button variant="ghost" />}>
          <InfoIcon data-icon="inline-start" />
          Intake summary
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Intake summary</DialogTitle>
            <DialogDescription>
              Housing matter referred by Community Legal Clinic on 3 September.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Client</dt>
            <dd>Amina Haddad</dd>
            <dt className="text-muted-foreground">Matter</dt>
            <dd>Unlawful eviction</dd>
            <dt className="text-muted-foreground">Advocate</dt>
            <dd>Sofia Marchetti</dd>
          </dl>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </Row>
  )
}

function AlertDialogDemo() {
  return (
    <Row label="Confirm destructive action">
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="destructive" />}>
          <Trash2Icon data-icon="inline-start" />
          Delete case file
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete case file #2024-HC-0417?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all documents, notes and hearing dates
              for this matter. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep file</AlertDialogCancel>
            <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" />}>
          Close matter
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Close this matter?</AlertDialogTitle>
            <AlertDialogDescription>
              The client will be notified that their case has been resolved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Close matter</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Row>
  )
}

function SheetDemo() {
  return (
    <Row label="Sides">
      <Sheet>
        <SheetTrigger render={<Button variant="outline" />}>Right</SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Case details</SheetTitle>
            <SheetDescription>
              Haddad v. Northgate Property Management
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4">
            <p className="text-sm">
              Next hearing: 14 October 2026, Housing Court Room 3B.
            </p>
            <p className="text-sm text-muted-foreground">
              Filed 3 September 2026. Status: Active.
            </p>
          </div>
          <SheetFooter>
            <Button>Open full record</Button>
            <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger render={<Button variant="outline" />}>Left</SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Filter cases</SheetTitle>
            <SheetDescription>Narrow the case list by status or advocate.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 text-sm">
            <span>Status: Active, Pending review</span>
            <span>Advocate: Sofia Marchetti</span>
            <span>Practice area: Housing</span>
          </div>
          <SheetFooter>
            <SheetClose render={<Button />}>Apply filters</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger render={<Button variant="outline" />}>Bottom</SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Upload document</SheetTitle>
            <SheetDescription>
              Attach a lease agreement, notice or correspondence to the case.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="sm:flex-row sm:justify-end">
            <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
            <Button>
              <UploadIcon data-icon="inline-start" />
              Choose file
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Row>
  )
}

function DrawerDemo() {
  return (
    <Row label="Swipeable">
      <Drawer showSwipeHandle>
        <DrawerTrigger render={<Button variant="outline" />}>
          <CalendarIcon data-icon="inline-start" />
          Schedule hearing
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Schedule hearing</DrawerTitle>
            <DrawerDescription>
              Pick a date for the next appearance in Haddad v. Northgate.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 p-4 text-sm">
            <span>Proposed: Tuesday, 14 October 2026 at 09:30</span>
            <span className="text-muted-foreground">Housing Court, Room 3B</span>
          </div>
          <DrawerFooter>
            <Button>Confirm date</Button>
            <DrawerClose render={<Button variant="outline" />}>Cancel</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer swipeDirection="right">
        <DrawerTrigger render={<Button variant="outline" />}>Side drawer</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Client contact</DrawerTitle>
            <DrawerDescription>Amina Haddad</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 p-4 text-sm">
            <span>Phone: +1 (555) 014-2290</span>
            <span>Preferred language: Arabic</span>
            <span>Interpreter required: Yes</span>
          </div>
          <DrawerFooter>
            <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Row>
  )
}

function PopoverDemo() {
  return (
    <Row label="Anchored">
      <Popover>
        <PopoverTrigger render={<Button variant="outline" />}>
          <UserPlusIcon data-icon="inline-start" />
          Assign advocate
        </PopoverTrigger>
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Assign advocate</PopoverTitle>
            <PopoverDescription>
              Choose who will take primary responsibility for this matter.
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex flex-col gap-1">
            <Button variant="ghost" size="sm" className="justify-start">
              Sofia Marchetti
            </Button>
            <Button variant="ghost" size="sm" className="justify-start">
              Daniel Okafor
            </Button>
            <Button variant="ghost" size="sm" className="justify-start">
              Priya Raman
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
          Court address
        </PopoverTrigger>
        <PopoverContent side="top" align="start">
          <PopoverHeader>
            <PopoverTitle>Housing Court</PopoverTitle>
            <PopoverDescription>
              111 Centre Street, Room 3B. Arrive 30 minutes before the hearing.
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </Row>
  )
}

function TooltipDemo() {
  return (
    <TooltipProvider>
      <Row label="On buttons">
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" size="icon" />}>
            <ArchiveIcon />
            <span className="sr-only">Archive case</span>
          </TooltipTrigger>
          <TooltipContent>Archive case</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" />}>
            <MailIcon data-icon="inline-start" />
            Notify client
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Send a hearing reminder by SMS and email
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" />}>
            <SearchIcon data-icon="inline-start" />
            Search
          </TooltipTrigger>
          <TooltipContent side="right">
            Search cases
            <Kbd>⌘K</Kbd>
          </TooltipContent>
        </Tooltip>
      </Row>
    </TooltipProvider>
  )
}

function HoverCardDemo() {
  return (
    <Row label="Preview on hover">
      <HoverCard>
        <HoverCardTrigger render={<Button variant="link" />}>
          @sofia.marchetti
        </HoverCardTrigger>
        <HoverCardContent>
          <div className="flex flex-col gap-1">
            <p className="font-medium">Sofia Marchetti</p>
            <p className="text-muted-foreground">
              Staff attorney, Housing Unit. 42 active matters.
            </p>
            <p className="text-xs text-muted-foreground">Joined March 2021</p>
          </div>
        </HoverCardContent>
      </HoverCard>

      <HoverCard>
        <HoverCardTrigger render={<Button variant="link" />}>
          #2024-HC-0417
        </HoverCardTrigger>
        <HoverCardContent side="top">
          <div className="flex flex-col gap-1">
            <p className="font-medium">Haddad v. Northgate Property Management</p>
            <p className="text-muted-foreground">
              Unlawful eviction. Next hearing 14 October 2026.
            </p>
          </div>
        </HoverCardContent>
      </HoverCard>
    </Row>
  )
}

function DropdownMenuDemo() {
  const [notifyClient, setNotifyClient] = React.useState(true)
  const [notifyTeam, setNotifyTeam] = React.useState(false)
  const [priority, setPriority] = React.useState('normal')

  return (
    <Row label="Actions, submenu, checkbox and radio items">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Case actions
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Haddad v. Northgate</DropdownMenuLabel>
            <DropdownMenuItem>
              <PencilIcon />
              Edit details
              <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CopyIcon />
              Duplicate
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ShareIcon />
                Share with
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem>Daniel Okafor</DropdownMenuItem>
                  <DropdownMenuItem>Priya Raman</DropdownMenuItem>
                  <DropdownMenuItem>Whole housing team</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={notifyClient}
              onCheckedChange={setNotifyClient}
            >
              Notify client
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={notifyTeam}
              onCheckedChange={setNotifyTeam}
            >
              Notify team
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Priority</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={priority} onValueChange={setPriority}>
              <DropdownMenuRadioItem value="low">Low</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="normal">Normal</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="urgent">Urgent</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive">
              <Trash2Icon />
              Delete case
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Row>
  )
}

function ContextMenuDemo() {
  const [pinned, setPinned] = React.useState(false)

  return (
    <Row label="Right-click target">
      <ContextMenu>
        <ContextMenuTrigger className="flex h-32 w-full max-w-md items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Right-click the case card
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuGroup>
            <ContextMenuLabel>Case #2024-HC-0417</ContextMenuLabel>
            <ContextMenuItem>
              <FolderOpenIcon />
              Open
              <ContextMenuShortcut>↵</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>
              <FileTextIcon />
              View documents
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <UsersIcon />
                Reassign to
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuGroup>
                  <ContextMenuItem>Daniel Okafor</ContextMenuItem>
                  <ContextMenuItem>Priya Raman</ContextMenuItem>
                </ContextMenuGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuCheckboxItem checked={pinned} onCheckedChange={setPinned}>
              Pin to dashboard
            </ContextMenuCheckboxItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem variant="destructive">
              <ArchiveIcon />
              Archive
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    </Row>
  )
}

function MenubarDemo() {
  const [showClosed, setShowClosed] = React.useState(false)
  const [view, setView] = React.useState('list')

  return (
    <Row label="Application menubar">
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>Case</MenubarTrigger>
          <MenubarContent>
            <MenubarGroup>
              <MenubarItem>
                New intake
                <MenubarShortcut>⌘N</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                Open case
                <MenubarShortcut>⌘O</MenubarShortcut>
              </MenubarItem>
              <MenubarSub>
                <MenubarSubTrigger>Recent</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarGroup>
                    <MenubarItem>Haddad v. Northgate</MenubarItem>
                    <MenubarItem>Ortiz benefits appeal</MenubarItem>
                    <MenubarItem>Nguyen wage claim</MenubarItem>
                  </MenubarGroup>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarGroup>
              <MenubarItem>
                Export summary
                <MenubarShortcut>⇧⌘E</MenubarShortcut>
              </MenubarItem>
            </MenubarGroup>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarGroup>
              <MenubarCheckboxItem checked={showClosed} onCheckedChange={setShowClosed}>
                Show closed cases
              </MenubarCheckboxItem>
            </MenubarGroup>
            <MenubarSeparator />
            <MenubarGroup>
              <MenubarRadioGroup value={view} onValueChange={setView}>
                <MenubarRadioItem value="list">List</MenubarRadioItem>
                <MenubarRadioItem value="board">Board</MenubarRadioItem>
                <MenubarRadioItem value="calendar">Calendar</MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarGroup>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarGroup>
              <MenubarItem>Intake guidelines</MenubarItem>
              <MenubarItem>Contact support</MenubarItem>
            </MenubarGroup>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </Row>
  )
}

function CommandDemo() {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-4">
      <Row label="Inline palette">
        <Command className="w-full max-w-md rounded-xl ring-1 ring-foreground/10">
          <CommandInput placeholder="Search cases, clients or actions..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Cases">
              <CommandItem>
                <FileTextIcon />
                Haddad v. Northgate Property Management
              </CommandItem>
              <CommandItem>
                <FileTextIcon />
                Ortiz benefits appeal
              </CommandItem>
              <CommandItem>
                <FileTextIcon />
                Nguyen wage claim
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem>
                <PlusIcon />
                New intake
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <CalendarIcon />
                Schedule hearing
                <CommandShortcut>⌘H</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <UploadIcon />
                Upload document
                <CommandShortcut>⌘U</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </Row>

      <Row label="As a dialog">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <SearchIcon data-icon="inline-start" />
          Open command palette
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
        <CommandDialog
          open={open}
          onOpenChange={setOpen}
          title="Search"
          description="Jump to a case or run an action"
        >
          <Command>
            <CommandInput placeholder="Type a case name or action..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Clients">
                <CommandItem onSelect={() => setOpen(false)}>
                  <UsersIcon />
                  Amina Haddad
                </CommandItem>
                <CommandItem onSelect={() => setOpen(false)}>
                  <UsersIcon />
                  Marco Ortiz
                </CommandItem>
                <CommandItem onSelect={() => setOpen(false)}>
                  <UsersIcon />
                  Linh Nguyen
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem onSelect={() => setOpen(false)}>
                  <PlusIcon />
                  New intake
                  <CommandShortcut>⌘N</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => setOpen(false)}>
                  <BellIcon />
                  Send hearing reminder
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
      </Row>
    </div>
  )
}

function ToastDemo() {
  return (
    <Row label="Fire a toast">
      <Toaster />
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            title: 'Case note saved',
            description: 'Your note on Haddad v. Northgate is now visible to the team.',
          })
        }
      >
        Default
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            type: 'success',
            title: 'Hearing scheduled',
            description: '14 October 2026 at 09:30, Housing Court Room 3B.',
          })
        }
      >
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            type: 'info',
            title: 'Interpreter requested',
            description: 'An Arabic interpreter has been requested for the client.',
          })
        }
      >
        Info
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            type: 'warning',
            title: 'Filing deadline approaching',
            description: 'The answer to the eviction petition is due in 3 days.',
          })
        }
      >
        Warning
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            type: 'error',
            title: 'Upload failed',
            description: 'lease-agreement.pdf could not be attached. Try again.',
          })
        }
      >
        Error
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            title: 'Case archived',
            description: 'Ortiz benefits appeal was moved to the archive.',
            actionProps: {
              children: 'Undo',
              onClick: () => {
                toast.add({ type: 'success', title: 'Case restored' })
              },
            },
          })
        }
      >
        With action
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
            loading: { title: 'Sending reminder', description: 'Notifying the client by SMS...' },
            success: { title: 'Reminder sent', description: 'The client received the hearing reminder.' },
            error: { title: 'Could not send reminder' },
          })
        }
      >
        Promise
      </Button>
    </Row>
  )
}

function KbdDemo() {
  return (
    <div className="flex flex-col gap-4">
      <Row label="Single keys">
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>⌥</Kbd>
        <Kbd>Ctrl</Kbd>
        <Kbd>Esc</Kbd>
        <Kbd>↵</Kbd>
      </Row>
      <Row label="Combinations">
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>N</Kbd>
        </KbdGroup>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <span className="text-xs text-muted-foreground">+</span>
          <Kbd>S</Kbd>
        </KbdGroup>
      </Row>
      <Row label="In context">
        <p className="text-sm text-muted-foreground">
          Press{' '}
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>{' '}
          to search cases, or{' '}
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>N</Kbd>
          </KbdGroup>{' '}
          to start a new intake.
        </p>
      </Row>
    </div>
  )
}

export function OverlaysShowcase() {
  return (
    <>
      <Section
        title="Dialog"
        description="Modal window for focused tasks such as adding a note or reviewing an intake summary."
      >
        <DialogDemo />
      </Section>

      <Section
        title="Alert Dialog"
        description="Interrupting confirmation for destructive or irreversible actions."
      >
        <AlertDialogDemo />
      </Section>

      <Section
        title="Sheet"
        description="Panel that slides in from an edge of the screen for secondary details or filters."
      >
        <SheetDemo />
      </Section>

      <Section
        title="Drawer"
        description="Swipeable bottom or side panel suited to touch devices."
      >
        <DrawerDemo />
      </Section>

      <Section
        title="Popover"
        description="Lightweight floating panel anchored to a trigger."
      >
        <PopoverDemo />
      </Section>

      <Section
        title="Tooltip"
        description="Short helper text shown on hover or focus."
      >
        <TooltipDemo />
      </Section>

      <Section
        title="Hover Card"
        description="Rich preview that appears when hovering a link or reference."
      >
        <HoverCardDemo />
      </Section>

      <Section
        title="Dropdown Menu"
        description="Action menu with groups, submenus, checkbox and radio items, and shortcuts."
      >
        <DropdownMenuDemo />
      </Section>

      <Section
        title="Context Menu"
        description="Menu revealed by right-clicking or long-pressing an element."
      >
        <ContextMenuDemo />
      </Section>

      <Section
        title="Menubar"
        description="Horizontal bar of application-level menus."
      >
        <MenubarDemo />
      </Section>

      <Section
        title="Command"
        description="Searchable command palette, inline or inside a dialog."
      >
        <CommandDemo />
      </Section>

      <Section
        title="Toast"
        description="Transient notifications fired imperatively with the toast manager."
      >
        <ToastDemo />
      </Section>

      <Section
        title="Kbd"
        description="Keyboard key and key-combination indicators."
      >
        <KbdDemo />
      </Section>
    </>
  )
}
