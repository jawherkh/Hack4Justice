import * as React from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Bookmark,
  ChevronDown,
  Copy,
  Italic,
  LayoutGrid,
  List,
  Mail,
  Plus,
  Scale,
  Search,
  Underline,
  UserRound,
} from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@hack4justice/ui/components/button-group'
import { Calendar } from '@hack4justice/ui/components/calendar'
import { Checkbox } from '@hack4justice/ui/components/checkbox'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@hack4justice/ui/components/combobox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@hack4justice/ui/components/input-group'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@hack4justice/ui/components/input-otp'
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@hack4justice/ui/components/native-select'
import { RadioGroup, RadioGroupItem } from '@hack4justice/ui/components/radio-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@hack4justice/ui/components/select'
import { Slider } from '@hack4justice/ui/components/slider'
import { Switch } from '@hack4justice/ui/components/switch'
import { Textarea } from '@hack4justice/ui/components/textarea'
import { Toggle } from '@hack4justice/ui/components/toggle'
import { ToggleGroup, ToggleGroupItem } from '@hack4justice/ui/components/toggle-group'
import { Row, Section } from '#/components/showcase/primitives'

/* -------------------------------------------------------------------------- */
/*                                Sample data                                 */
/* -------------------------------------------------------------------------- */

const CASE_TYPES = [
  { value: 'civil', label: 'Civil' },
  { value: 'criminal', label: 'Criminal' },
  { value: 'family', label: 'Family' },
  { value: 'immigration', label: 'Immigration' },
  { value: 'housing', label: 'Housing' },
] as const

const LAWYERS = [
  { value: 'amira', label: 'Amira Ben Salah' },
  { value: 'karim', label: 'Karim Trabelsi' },
  { value: 'lina', label: 'Lina Haddad' },
  { value: 'omar', label: 'Omar Mansour' },
  { value: 'sana', label: 'Sana Jaziri' },
] as const

const LAWYER_NAMES = LAWYERS.map((lawyer) => lawyer.label)

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const

const PARALEGALS = ['Nadia Kacem', 'Youssef Cherif', 'Rania Gharbi'] as const

const TEAM_ITEMS = [
  ...LAWYERS.map((lawyer) => ({ value: lawyer.label, label: lawyer.label })),
  ...PARALEGALS.map((name) => ({ value: name, label: name })),
]

type DateRange = { from: Date | undefined; to?: Date | undefined }

/* -------------------------------------------------------------------------- */
/*                                  Showcase                                  */
/* -------------------------------------------------------------------------- */

export function FormsShowcase() {
  return (
    <>
      <CheckboxSection />
      <RadioGroupSection />
      <SwitchSection />
      <SelectSection />
      <NativeSelectSection />
      <TextareaSection />
      <SliderSection />
      <InputOTPSection />
      <InputGroupSection />
      <ButtonGroupSection />
      <ToggleSection />
      <ToggleGroupSection />
      <FieldSection />
      <ComboboxSection />
      <CalendarSection />
    </>
  )
}

/* ------------------------------- Checkbox --------------------------------- */

function CheckboxSection() {
  const [notify, setNotify] = React.useState({ email: true, sms: false, portal: true })
  const values = Object.values(notify)
  const allChecked = values.every(Boolean)
  const someChecked = values.some(Boolean) && !allChecked

  return (
    <Section title="Checkbox" description="Binary and indeterminate selection.">
      <Row label="States">
        <Checkbox aria-label="Unchecked" />
        <Checkbox defaultChecked aria-label="Checked" />
        <Checkbox indeterminate aria-label="Indeterminate" />
        <Checkbox disabled aria-label="Disabled" />
        <Checkbox disabled defaultChecked aria-label="Disabled checked" />
        <Checkbox aria-invalid aria-label="Invalid" />
      </Row>
      <Row label="With label">
        <Field orientation="horizontal" className="w-fit">
          <Checkbox id="cb-terms" />
          <FieldLabel htmlFor="cb-terms">Client agreed to representation terms</FieldLabel>
        </Field>
      </Row>
      <Row label="With description">
        <Field orientation="horizontal" className="max-w-sm">
          <Checkbox id="cb-legal-aid" defaultChecked />
          <FieldContent>
            <FieldLabel htmlFor="cb-legal-aid">Eligible for legal aid</FieldLabel>
            <FieldDescription>
              Household income falls below the assistance threshold.
            </FieldDescription>
          </FieldContent>
        </Field>
      </Row>
      <Row label="Controlled group">
        <FieldSet className="max-w-sm">
          <FieldLegend variant="label">Notify client via</FieldLegend>
          <FieldGroup data-slot="checkbox-group">
            <Field orientation="horizontal">
              <Checkbox
                id="cb-all"
                checked={allChecked}
                indeterminate={someChecked}
                onCheckedChange={(checked) =>
                  setNotify({ email: checked, sms: checked, portal: checked })
                }
              />
              <FieldLabel htmlFor="cb-all">All channels</FieldLabel>
            </Field>
            {(['email', 'sms', 'portal'] as const).map((channel) => (
              <Field key={channel} orientation="horizontal" className="pl-6">
                <Checkbox
                  id={`cb-${channel}`}
                  checked={notify[channel]}
                  onCheckedChange={(checked) =>
                    setNotify((prev) => ({ ...prev, [channel]: checked }))
                  }
                />
                <FieldLabel htmlFor={`cb-${channel}`} className="capitalize">
                  {channel}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      </Row>
      <Row label="Card style">
        <FieldLabel htmlFor="cb-card" className="max-w-sm">
          <Field orientation="horizontal">
            <Checkbox id="cb-card" defaultChecked />
            <FieldContent>
              <FieldTitle>Pro bono case</FieldTitle>
              <FieldDescription>Waive all fees for this matter.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldLabel>
      </Row>
    </Section>
  )
}

/* ------------------------------ Radio group ------------------------------- */

function RadioGroupSection() {
  const [caseType, setCaseType] = React.useState<string>('civil')

  return (
    <Section title="Radio group" description="Single choice from a small set.">
      <Row label="Controlled">
        <Field className="max-w-sm">
          <FieldLabel>Case type</FieldLabel>
          <RadioGroup
            value={caseType}
            onValueChange={(value) => setCaseType(String(value))}
            aria-label="Case type"
          >
            {CASE_TYPES.map((type) => (
              <Field key={type.value} orientation="horizontal">
                <RadioGroupItem id={`rg-${type.value}`} value={type.value} />
                <FieldLabel htmlFor={`rg-${type.value}`} className="font-normal">
                  {type.label}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
          <FieldDescription>
            Selected: <span className="font-medium text-foreground">{caseType}</span>
          </FieldDescription>
        </Field>
      </Row>
      <Row label="Horizontal">
        <RadioGroup defaultValue="medium" className="flex w-fit gap-4" aria-label="Priority">
          {PRIORITIES.map((priority) => (
            <Field key={priority} orientation="horizontal" className="w-fit">
              <RadioGroupItem id={`rg-h-${priority}`} value={priority.toLowerCase()} />
              <FieldLabel htmlFor={`rg-h-${priority}`} className="font-normal">
                {priority}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </Row>
      <Row label="Disabled item">
        <RadioGroup defaultValue="open" className="w-fit" aria-label="Status">
          <Field orientation="horizontal">
            <RadioGroupItem id="rg-open" value="open" />
            <FieldLabel htmlFor="rg-open" className="font-normal">
              Open
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem id="rg-archived" value="archived" disabled />
            <FieldLabel htmlFor="rg-archived" className="font-normal">
              Archived (locked)
            </FieldLabel>
          </Field>
        </RadioGroup>
      </Row>
      <Row label="Invalid">
        <Field data-invalid className="w-fit">
          <RadioGroup aria-label="Court" aria-invalid>
            <Field orientation="horizontal">
              <RadioGroupItem id="rg-district" value="district" aria-invalid />
              <FieldLabel htmlFor="rg-district" className="font-normal">
                District court
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id="rg-appeal" value="appeal" aria-invalid />
              <FieldLabel htmlFor="rg-appeal" className="font-normal">
                Court of appeal
              </FieldLabel>
            </Field>
          </RadioGroup>
          <FieldError>Select the court handling this case.</FieldError>
        </Field>
      </Row>
      <Row label="Card style">
        <RadioGroup defaultValue="in-person" className="max-w-sm gap-2" aria-label="Meeting">
          {[
            ['in-person', 'In person', 'Meet at the legal aid office.'],
            ['remote', 'Video call', 'Secure link sent by email.'],
          ].map(([value, title, description]) => (
            <FieldLabel key={value} htmlFor={`rg-card-${value}`}>
              <Field orientation="horizontal">
                <RadioGroupItem id={`rg-card-${value}`} value={value} />
                <FieldContent>
                  <FieldTitle>{title}</FieldTitle>
                  <FieldDescription>{description}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </Row>
    </Section>
  )
}

/* -------------------------------- Switch ---------------------------------- */

function SwitchSection() {
  const [confidential, setConfidential] = React.useState(true)

  return (
    <Section title="Switch" description="On/off toggles in two sizes.">
      <Row label="Sizes">
        <Switch size="sm" aria-label="Small" />
        <Switch aria-label="Default" />
        <Switch size="sm" defaultChecked aria-label="Small checked" />
        <Switch defaultChecked aria-label="Default checked" />
      </Row>
      <Row label="States">
        <Switch disabled aria-label="Disabled" />
        <Switch disabled defaultChecked aria-label="Disabled checked" />
        <Switch aria-invalid aria-label="Invalid" />
      </Row>
      <Row label="With label">
        <Field orientation="horizontal" className="w-fit">
          <Switch id="sw-reminders" defaultChecked />
          <FieldLabel htmlFor="sw-reminders">Hearing reminders</FieldLabel>
        </Field>
      </Row>
      <Row label="Controlled with description">
        <Field orientation="horizontal" className="max-w-sm">
          <FieldContent>
            <FieldLabel htmlFor="sw-confidential">Confidential case</FieldLabel>
            <FieldDescription>
              {confidential
                ? 'Only the assigned lawyer can view documents.'
                : 'Visible to every member of the legal team.'}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="sw-confidential"
            checked={confidential}
            onCheckedChange={setConfidential}
          />
        </Field>
      </Row>
    </Section>
  )
}

/* -------------------------------- Select ---------------------------------- */

function SelectSection() {
  const [lawyer, setLawyer] = React.useState<string | null>(null)

  return (
    <Section title="Select" description="Popup selection built on Base UI Select.">
      <Row label="Controlled">
        <Field className="w-56">
          <FieldLabel htmlFor="sel-lawyer">Assign lawyer</FieldLabel>
          <Select items={LAWYERS} value={lawyer} onValueChange={setLawyer}>
            <SelectTrigger id="sel-lawyer" className="w-full">
              <SelectValue placeholder="Choose a lawyer" />
            </SelectTrigger>
            <SelectContent>
              {LAWYERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {lawyer ? `Assigned to ${lawyer}.` : 'No lawyer assigned yet.'}
          </FieldDescription>
        </Field>
      </Row>
      <Row label="Sizes">
        <Select items={CASE_TYPES} defaultValue="civil">
          <SelectTrigger size="sm" aria-label="Case type, small">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CASE_TYPES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={CASE_TYPES} defaultValue="civil">
          <SelectTrigger aria-label="Case type, default">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CASE_TYPES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Groups and separator">
        <Select items={TEAM_ITEMS}>
          <SelectTrigger className="w-56" aria-label="Team member">
            <UserRound className="text-muted-foreground" />
            <SelectValue placeholder="Team member" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Lawyers</SelectLabel>
              {LAWYERS.map((item) => (
                <SelectItem key={item.value} value={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Paralegals</SelectLabel>
              {PARALEGALS.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Row>
      <Row label="States">
        <Select items={CASE_TYPES} defaultValue="family" disabled>
          <SelectTrigger aria-label="Disabled">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CASE_TYPES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Field data-invalid className="w-fit">
          <Select items={CASE_TYPES}>
            <SelectTrigger aria-invalid aria-label="Invalid">
              <SelectValue placeholder="Case type" />
            </SelectTrigger>
            <SelectContent>
              {CASE_TYPES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>Case type is required.</FieldError>
        </Field>
      </Row>
    </Section>
  )
}

/* ----------------------------- Native select ------------------------------ */

function NativeSelectSection() {
  return (
    <Section title="Native select" description="Browser-native select with styled shell.">
      <Row label="Sizes">
        <NativeSelect size="sm" defaultValue="civil" aria-label="Case type, small">
          {CASE_TYPES.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {item.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect defaultValue="civil" aria-label="Case type, default">
          {CASE_TYPES.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {item.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Row>
      <Row label="Option groups">
        <Field className="w-56">
          <FieldLabel htmlFor="ns-assignee">Assignee</FieldLabel>
          <NativeSelect id="ns-assignee" className="w-full" defaultValue="">
            <NativeSelectOption value="" disabled>
              Choose a team member
            </NativeSelectOption>
            <NativeSelectOptGroup label="Lawyers">
              {LAWYERS.map((item) => (
                <NativeSelectOption key={item.value} value={item.value}>
                  {item.label}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Paralegals">
              {PARALEGALS.map((name) => (
                <NativeSelectOption key={name} value={name}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          </NativeSelect>
        </Field>
      </Row>
      <Row label="States">
        <NativeSelect disabled defaultValue="family" aria-label="Disabled">
          {CASE_TYPES.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {item.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Field data-invalid className="w-fit">
          <NativeSelect aria-invalid defaultValue="" aria-label="Invalid">
            <NativeSelectOption value="" disabled>
              Court
            </NativeSelectOption>
            <NativeSelectOption value="district">District court</NativeSelectOption>
            <NativeSelectOption value="appeal">Court of appeal</NativeSelectOption>
          </NativeSelect>
          <FieldError>Court is required.</FieldError>
        </Field>
      </Row>
    </Section>
  )
}

/* -------------------------------- Textarea -------------------------------- */

function TextareaSection() {
  const [notes, setNotes] = React.useState('')
  const limit = 200

  return (
    <Section title="Textarea" description="Multi-line text, auto-sized to content.">
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ta-default">Case summary</FieldLabel>
          <Textarea id="ta-default" placeholder="Briefly describe the client's situation" />
        </Field>
        <Field>
          <FieldLabel htmlFor="ta-value">With value</FieldLabel>
          <Textarea
            id="ta-value"
            defaultValue="Client received an eviction notice on 3 March and has 14 days to respond."
          />
        </Field>
        <Field data-disabled>
          <FieldLabel htmlFor="ta-disabled">Disabled</FieldLabel>
          <Textarea id="ta-disabled" disabled placeholder="Locked after filing" />
        </Field>
        <Field data-invalid>
          <FieldLabel htmlFor="ta-invalid">Invalid</FieldLabel>
          <Textarea id="ta-invalid" aria-invalid defaultValue="Too short" />
          <FieldError>Summary must be at least 40 characters.</FieldError>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="ta-notes">Internal notes</FieldLabel>
          <Textarea
            id="ta-notes"
            value={notes}
            maxLength={limit}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Visible to the legal team only"
            className="min-h-24"
          />
          <FieldDescription className="text-right">
            {notes.length}/{limit}
          </FieldDescription>
        </Field>
      </div>
    </Section>
  )
}

/* --------------------------------- Slider --------------------------------- */

function SliderSection() {
  const [hours, setHours] = React.useState(12)
  const [income, setIncome] = React.useState<readonly number[]>([800, 2400])

  return (
    <Section title="Slider" description="Single value, range, steps and orientation.">
      <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="sl-hours">Estimated hours</FieldLabel>
            <span className="text-sm text-muted-foreground tabular-nums">{hours} h</span>
          </div>
          <Slider
            id="sl-hours"
            value={hours}
            onValueChange={(value) => setHours(typeof value === 'number' ? value : value[0]!)}
            min={0}
            max={40}
            aria-label="Estimated hours"
          />
        </Field>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel>Household income range</FieldLabel>
            <span className="text-sm text-muted-foreground tabular-nums">
              {income[0]} – {income[1]} TND
            </span>
          </div>
          <Slider
            value={income}
            onValueChange={(value) => setIncome(typeof value === 'number' ? [value] : value)}
            min={0}
            max={5000}
            step={100}
            aria-label="Household income range"
          />
        </Field>
        <Field>
          <FieldLabel>Steps of 25</FieldLabel>
          <Slider defaultValue={50} step={25} aria-label="Steps of 25" />
        </Field>
        <Field data-disabled>
          <FieldLabel>Disabled</FieldLabel>
          <Slider defaultValue={30} disabled aria-label="Disabled" />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>Vertical</FieldLabel>
          <div className="flex h-40 items-stretch gap-8">
            <Slider orientation="vertical" defaultValue={60} aria-label="Vertical" />
            <Slider
              orientation="vertical"
              defaultValue={[20, 70]}
              aria-label="Vertical range"
            />
          </div>
        </Field>
      </div>
    </Section>
  )
}

/* -------------------------------- Input OTP ------------------------------- */

function InputOTPSection() {
  const [code, setCode] = React.useState('')

  return (
    <Section title="Input OTP" description="One-time codes for client verification.">
      <Row label="Six digits with separator">
        <Field className="w-fit">
          <FieldLabel htmlFor="otp-code">Verification code</FieldLabel>
          <InputOTP id="otp-code" maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <FieldDescription>
            {code.length === 6 ? 'Code complete.' : `Enter the 6-digit code sent by SMS (${code.length}/6).`}
          </FieldDescription>
        </Field>
      </Row>
      <Row label="Four digits, numeric only">
        <InputOTP maxLength={4} pattern="^\d+$" aria-label="PIN">
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
      </Row>
      <Row label="Disabled">
        <InputOTP maxLength={4} disabled defaultValue="12" aria-label="Disabled">
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
      </Row>
      <Row label="Invalid">
        <Field data-invalid className="w-fit">
          <InputOTP maxLength={4} defaultValue="0000" aria-label="Invalid code">
            <InputOTPGroup>
              <InputOTPSlot index={0} aria-invalid />
              <InputOTPSlot index={1} aria-invalid />
              <InputOTPSlot index={2} aria-invalid />
              <InputOTPSlot index={3} aria-invalid />
            </InputOTPGroup>
          </InputOTP>
          <FieldError>That code has expired.</FieldError>
        </Field>
      </Row>
    </Section>
  )
}

/* ------------------------------- Input group ------------------------------ */

function InputGroupSection() {
  return (
    <Section title="Input group" description="Inputs with icons, text, buttons and block addons.">
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search cases" />
        </InputGroup>
        <InputGroup>
          <InputGroupAddon>
            <Mail />
          </InputGroupAddon>
          <InputGroupInput type="email" placeholder="client@example.com" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>.tn</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>CASE-</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput placeholder="1042" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton aria-label="Copy case number">
              <Copy />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput placeholder="Add a lawyer by email" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton variant="default">
              <Plus data-icon="inline-start" />
              Invite
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupAddon align="block-start">
            <InputGroupText>Docket number</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput placeholder="TN-2026-00412" />
        </InputGroup>
        <InputGroup>
          <InputGroupTextarea placeholder="Write a note for the team" />
          <InputGroupAddon align="block-end" className="border-t">
            <InputGroupText>Markdown supported</InputGroupText>
            <InputGroupButton className="ml-auto" size="sm" variant="outline">
              Save note
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Disabled" disabled />
        </InputGroup>
        <Field data-invalid>
          <InputGroup>
            <InputGroupAddon>
              <Mail />
            </InputGroupAddon>
            <InputGroupInput defaultValue="not-an-email" aria-invalid />
          </InputGroup>
          <FieldError>Enter a valid email address.</FieldError>
        </Field>
      </div>
    </Section>
  )
}

/* ------------------------------- Button group ----------------------------- */

function ButtonGroupSection() {
  return (
    <Section title="Button group" description="Attached buttons, separators, text and nesting.">
      <Row label="Horizontal">
        <ButtonGroup>
          <Button variant="outline">Open</Button>
          <Button variant="outline">In review</Button>
          <Button variant="outline">Closed</Button>
        </ButtonGroup>
      </Row>
      <Row label="With separator">
        <ButtonGroup>
          <Button>Assign lawyer</Button>
          <ButtonGroupSeparator />
          <Button size="icon" aria-label="More options">
            <ChevronDown />
          </Button>
        </ButtonGroup>
      </Row>
      <Row label="With text">
        <ButtonGroup>
          <ButtonGroupText>
            <Scale />
            Case #1042
          </ButtonGroupText>
          <Button variant="outline">View</Button>
          <Button variant="outline">Edit</Button>
        </ButtonGroup>
        <ButtonGroup>
          <ButtonGroupText render={<label htmlFor="bg-docket" />}>Docket</ButtonGroupText>
          <Input id="bg-docket" placeholder="TN-2026-00412" className="w-40" />
          <Button variant="outline">Search</Button>
        </ButtonGroup>
      </Row>
      <Row label="Nested groups">
        <ButtonGroup>
          <ButtonGroup>
            <Button variant="outline" size="icon" aria-label="Align left">
              <AlignLeft />
            </Button>
            <Button variant="outline" size="icon" aria-label="Align center">
              <AlignCenter />
            </Button>
            <Button variant="outline" size="icon" aria-label="Align right">
              <AlignRight />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button variant="outline" size="icon" aria-label="Bold">
              <Bold />
            </Button>
            <Button variant="outline" size="icon" aria-label="Italic">
              <Italic />
            </Button>
          </ButtonGroup>
        </ButtonGroup>
      </Row>
      <Row label="Vertical">
        <ButtonGroup orientation="vertical">
          <Button variant="outline">Schedule hearing</Button>
          <Button variant="outline">Upload evidence</Button>
          <Button variant="outline">Close case</Button>
        </ButtonGroup>
      </Row>
    </Section>
  )
}

/* --------------------------------- Toggle --------------------------------- */

function ToggleSection() {
  const [bookmarked, setBookmarked] = React.useState(false)

  return (
    <Section title="Toggle" description="Two-state buttons.">
      <Row label="Variants">
        <Toggle aria-label="Bold">
          <Bold />
        </Toggle>
        <Toggle variant="outline" aria-label="Italic">
          <Italic />
        </Toggle>
      </Row>
      <Row label="Sizes">
        <Toggle size="sm" variant="outline" aria-label="Small">
          <Bold />
        </Toggle>
        <Toggle variant="outline" aria-label="Default">
          <Bold />
        </Toggle>
        <Toggle size="lg" variant="outline" aria-label="Large">
          <Bold />
        </Toggle>
      </Row>
      <Row label="With text">
        <Toggle variant="outline">
          <Underline data-icon="inline-start" />
          Underline
        </Toggle>
        <Toggle
          variant="outline"
          pressed={bookmarked}
          onPressedChange={setBookmarked}
          aria-label="Bookmark case"
        >
          <Bookmark data-icon="inline-start" />
          {bookmarked ? 'Bookmarked' : 'Bookmark'}
        </Toggle>
      </Row>
      <Row label="States">
        <Toggle defaultPressed variant="outline" aria-label="Pressed">
          <Bold />
        </Toggle>
        <Toggle disabled variant="outline" aria-label="Disabled">
          <Bold />
        </Toggle>
        <Toggle disabled defaultPressed variant="outline" aria-label="Disabled pressed">
          <Bold />
        </Toggle>
      </Row>
    </Section>
  )
}

/* ------------------------------- Toggle group ----------------------------- */

function ToggleGroupSection() {
  const [view, setView] = React.useState<string[]>(['list'])
  const [format, setFormat] = React.useState<string[]>(['bold'])

  return (
    <Section title="Toggle group" description="Single or multiple selection from related toggles.">
      <Row label="Single (controlled)">
        <ToggleGroup
          value={view}
          onValueChange={setView}
          variant="outline"
          aria-label="Case view"
        >
          <ToggleGroupItem value="list" aria-label="List view">
            <List />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid />
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-sm text-muted-foreground">View: {view[0] ?? 'none'}</span>
      </Row>
      <Row label="Multiple">
        <ToggleGroup multiple value={format} onValueChange={setFormat} aria-label="Formatting">
          <ToggleGroupItem value="bold" aria-label="Bold">
            <Bold />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <Italic />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <Underline />
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-sm text-muted-foreground">
          {format.length ? format.join(', ') : 'none'}
        </span>
      </Row>
      <Row label="Attached (spacing 0)">
        <ToggleGroup variant="outline" spacing={0} defaultValue={['open']} aria-label="Status">
          <ToggleGroupItem value="open">Open</ToggleGroupItem>
          <ToggleGroupItem value="review">In review</ToggleGroupItem>
          <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <Row label="Sizes">
        <ToggleGroup size="sm" variant="outline" defaultValue={['left']} aria-label="Small">
          <ToggleGroupItem value="left" aria-label="Left">
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Center">
            <AlignCenter />
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup size="lg" variant="outline" defaultValue={['left']} aria-label="Large">
          <ToggleGroupItem value="left" aria-label="Left">
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Center">
            <AlignCenter />
          </ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <Row label="Vertical and disabled">
        <ToggleGroup
          orientation="vertical"
          variant="outline"
          spacing={0}
          defaultValue={['civil']}
          aria-label="Case type"
        >
          {CASE_TYPES.slice(0, 3).map((type) => (
            <ToggleGroupItem key={type.value} value={type.value}>
              {type.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup disabled variant="outline" defaultValue={['list']} aria-label="Disabled">
          <ToggleGroupItem value="list" aria-label="List view">
            <List />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid />
          </ToggleGroupItem>
        </ToggleGroup>
      </Row>
    </Section>
  )
}

/* --------------------------------- Field ---------------------------------- */

function FieldSection() {
  return (
    <Section
      title="Field"
      description="Form layout primitives: sets, groups, orientations, descriptions and errors."
    >
      <form
        className="max-w-lg"
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <FieldGroup>
          <FieldSet>
            <FieldLegend>New case</FieldLegend>
            <FieldDescription>Intake details for a new legal aid request.</FieldDescription>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="f-client">Client name</FieldLabel>
                <Input id="f-client" placeholder="Full legal name" />
                <FieldDescription>As it appears on the identity document.</FieldDescription>
              </Field>
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="f-court">Court</FieldLabel>
                  <FieldDescription>Where the matter will be heard.</FieldDescription>
                </FieldContent>
                <NativeSelect id="f-court" defaultValue="district">
                  <NativeSelectOption value="district">District court</NativeSelectOption>
                  <NativeSelectOption value="appeal">Court of appeal</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field data-invalid>
                <FieldLabel htmlFor="f-email">Email</FieldLabel>
                <Input id="f-email" type="email" defaultValue="client@" aria-invalid />
                <FieldError>Enter a valid email address.</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="f-password">Portal password</FieldLabel>
                <Input id="f-password" type="password" aria-invalid />
                <FieldError
                  errors={[
                    { message: 'Must be at least 12 characters.' },
                    { message: 'Must include a number.' },
                    { message: 'Must include a number.' },
                  ]}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSeparator>Preferences</FieldSeparator>

          <FieldSet>
            <FieldLegend variant="label">Contact options</FieldLegend>
            <FieldGroup data-slot="checkbox-group">
              <Field orientation="horizontal">
                <Checkbox id="f-email-ok" defaultChecked />
                <FieldLabel htmlFor="f-email-ok" className="font-normal">
                  Email updates
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="f-sms-ok" />
                <FieldLabel htmlFor="f-sms-ok" className="font-normal">
                  SMS reminders
                </FieldLabel>
              </Field>
            </FieldGroup>
          </FieldSet>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="f-urgent">Mark as urgent</FieldLabel>
              <FieldDescription>Moves the case to the top of the intake queue.</FieldDescription>
            </FieldContent>
            <Switch id="f-urgent" />
          </Field>

          <Field data-disabled>
            <FieldLabel htmlFor="f-ref">Internal reference</FieldLabel>
            <Input id="f-ref" disabled defaultValue="Generated on save" />
          </Field>

          <Field orientation="horizontal" className="justify-end">
            <Button type="button" variant="outline">
              Cancel
            </Button>
            <Button type="submit">Create case</Button>
          </Field>
        </FieldGroup>
      </form>
    </Section>
  )
}

/* -------------------------------- Combobox -------------------------------- */

function ComboboxSection() {
  const [lawyer, setLawyer] = React.useState<string | null>(null)
  const [team, setTeam] = React.useState<string[]>([LAWYER_NAMES[0]!])
  const anchor = useComboboxAnchor()

  return (
    <Section title="Combobox" description="Filterable selection, single and multiple with chips.">
      <Row label="Single (controlled)">
        <Field className="w-64">
          <FieldLabel htmlFor="cbx-lawyer">Assign lawyer</FieldLabel>
          <Combobox items={LAWYER_NAMES} value={lawyer} onValueChange={setLawyer}>
            <ComboboxInput id="cbx-lawyer" placeholder="Search lawyers" className="w-full" />
            <ComboboxContent>
              <ComboboxEmpty>No lawyer found.</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>{lawyer ? `Assigned to ${lawyer}.` : 'Unassigned.'}</FieldDescription>
        </Field>
      </Row>
      <Row label="With clear button and groups">
        <Combobox items={[...LAWYER_NAMES, ...PARALEGALS]}>
          <ComboboxInput placeholder="Team member" showClear className="w-64" />
          <ComboboxContent>
            <ComboboxEmpty>No match.</ComboboxEmpty>
            <ComboboxList>
              <ComboboxGroup>
                <ComboboxLabel>Lawyers</ComboboxLabel>
                {LAWYER_NAMES.map((name) => (
                  <ComboboxItem key={name} value={name}>
                    {name}
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
              <ComboboxGroup>
                <ComboboxLabel>Paralegals</ComboboxLabel>
                {PARALEGALS.map((name) => (
                  <ComboboxItem key={name} value={name}>
                    {name}
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Row>
      <Row label="Multiple with chips">
        <Field className="w-full max-w-md">
          <FieldLabel htmlFor="cbx-team">Legal team</FieldLabel>
          <Combobox multiple items={LAWYER_NAMES} value={team} onValueChange={setTeam}>
            <ComboboxChips ref={anchor}>
              <ComboboxValue>
                {(values: string[]) => (
                  <>
                    {values.map((value) => (
                      <ComboboxChip key={value}>{value}</ComboboxChip>
                    ))}
                    <ComboboxChipsInput id="cbx-team" placeholder="Add a lawyer" />
                  </>
                )}
              </ComboboxValue>
            </ComboboxChips>
            <ComboboxContent anchor={anchor}>
              <ComboboxEmpty>No lawyer found.</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>{team.length} member(s) selected.</FieldDescription>
        </Field>
      </Row>
      <Row label="Disabled">
        <Combobox items={LAWYER_NAMES} defaultValue={LAWYER_NAMES[1]} disabled>
          <ComboboxInput disabled className="w-64" aria-label="Disabled combobox" />
          <ComboboxContent>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Row>
    </Section>
  )
}

/* -------------------------------- Calendar -------------------------------- */

function CalendarSection() {
  const today = React.useMemo(() => new Date(), [])
  const [hearing, setHearing] = React.useState<Date | undefined>(today)
  const [period, setPeriod] = React.useState<DateRange | undefined>({
    from: today,
    to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6),
  })
  const [deadlines, setDeadlines] = React.useState<Date[] | undefined>([])

  return (
    <Section title="Calendar" description="Single, range and multiple date selection.">
      <div className="flex flex-wrap items-start gap-6">
        <Field className="w-fit">
          <FieldLabel>Hearing date</FieldLabel>
          <Calendar
            mode="single"
            selected={hearing}
            onSelect={setHearing}
            className="rounded-lg border"
          />
          <FieldDescription>
            {hearing ? hearing.toLocaleDateString() : 'No date selected.'}
          </FieldDescription>
        </Field>
        <Field className="w-fit">
          <FieldLabel>Filing period</FieldLabel>
          <Calendar
            mode="range"
            selected={period}
            onSelect={setPeriod}
            numberOfMonths={2}
            className="rounded-lg border"
          />
          <FieldDescription>
            {period?.from
              ? `${period.from.toLocaleDateString()} – ${period.to?.toLocaleDateString() ?? '…'}`
              : 'Pick a start and end date.'}
          </FieldDescription>
        </Field>
        <Field className="w-fit">
          <FieldLabel>Deadlines (multiple)</FieldLabel>
          <Calendar
            mode="multiple"
            selected={deadlines}
            onSelect={setDeadlines}
            className="rounded-lg border"
          />
          <FieldDescription>{deadlines?.length ?? 0} deadline(s).</FieldDescription>
        </Field>
        <Field className="w-fit">
          <FieldLabel>Dropdown caption, weekends disabled</FieldLabel>
          <Calendar
            mode="single"
            captionLayout="dropdown"
            defaultMonth={today}
            startMonth={new Date(today.getFullYear() - 1, 0)}
            endMonth={new Date(today.getFullYear() + 1, 11)}
            disabled={[{ dayOfWeek: [0, 6] }, { before: today }]}
            className="rounded-lg border"
          />
          <FieldDescription>Past dates and weekends cannot be chosen.</FieldDescription>
        </Field>
      </div>
    </Section>
  )
}
