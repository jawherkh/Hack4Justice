import type { AnyFieldApi } from '@tanstack/react-form'
import { useForm } from '@tanstack/react-form'
import {
  ACCOUNT_TYPES,
  COMPANY_STAGES,
  GOVERNORATES,
  LEGAL_FORMS,
  SUPPORTED_LOCALES,
  AccountType,
  type AccountType as AccountTypeValue,
} from '@hack4justice/shared'
import { Briefcase, Check, Scale } from 'lucide-react'
import { Checkbox } from '@hack4justice/ui/components/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@hack4justice/ui/components/field'
import { NativeSelect, NativeSelectOption } from '@hack4justice/ui/components/native-select'
import { cn } from '@hack4justice/ui/lib/utils'
import { useI18n } from '#/i18n'
import { TextField } from '#/components/auth/form-field'
import {
  ACCOUNT_TYPE_LABEL,
  COMPANY_STAGE_LABEL,
  LEGAL_FORM_LABEL,
  LOCALE_LABEL,
  governorateLabel,
} from './labels'
import { companyNameError, fieldSchemas, type ProfileFieldName, type ProfileFormValues } from './schemas'

interface UseProfileFormOptions {
  defaultValues: ProfileFormValues
  onSubmit: (value: ProfileFormValues) => Promise<void> | void
}

/**
 * One form definition shared by the onboarding wizard and the account page.
 * Validation lives on the fields (zod, `onChange`), not on the form, so a
 * step can be checked on its own with `validateFields`.
 */
export function useProfileForm({ defaultValues, onSubmit }: UseProfileFormOptions) {
  return useForm({
    defaultValues,
    onSubmit: ({ value }) => onSubmit(value),
  })
}

export type ProfileForm = ReturnType<typeof useProfileForm>

/**
 * Runs every validator of the given fields as if submitting, marks them
 * touched so errors render, and reports whether all of them passed.
 */
export async function validateFields(form: ProfileForm, fields: ProfileFieldName[]): Promise<boolean> {
  const errors = await Promise.all(fields.map((field) => form.validateField(field, 'submit')))
  return errors.every((list) => list.length === 0)
}

function isInvalid(field: AnyFieldApi) {
  return field.state.meta.isTouched && field.state.meta.errors.length > 0
}

interface SelectFieldProps {
  field: AnyFieldApi
  label: string
  hint?: string
  /** Shown as the blank option; omit for required selects. */
  placeholder?: string
  options: { value: string; label: string }[]
}

function SelectField({ field, label, hint, placeholder, options }: SelectFieldProps) {
  const invalid = isInvalid(field)
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <NativeSelect
        id={field.name}
        name={field.name}
        value={String(field.state.value ?? '')}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className="w-full"
      >
        {placeholder !== undefined ? <NativeSelectOption value="">{placeholder}</NativeSelectOption> : null}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {invalid ? (
        <FieldError errors={field.state.meta.errors} />
      ) : hint ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : null}
    </Field>
  )
}

const ACCOUNT_TYPE_ICON: Record<AccountTypeValue, typeof Briefcase> = {
  [AccountType.BUSINESS]: Briefcase,
  [AccountType.PROFESSIONAL]: Scale,
}

/** Three choice cards. Native radios keep keyboard and form semantics. */
function AccountTypeField({ field }: { field: AnyFieldApi }) {
  const { t } = useI18n()
  const invalid = isInvalid(field)
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel id="account-type-label">{t('onboarding.field.accountType')}</FieldLabel>
      <div role="radiogroup" aria-labelledby="account-type-label" className="grid gap-2 sm:grid-cols-2">
        {ACCOUNT_TYPES.map((value) => {
          const selected = field.state.value === value
          const Icon = ACCOUNT_TYPE_ICON[value]
          const id = `account-type-${value}`
          return (
            <label
              key={value}
              htmlFor={id}
              className={cn(
                'relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-background p-3 transition-all',
                'hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input',
              )}
            >
              <input
                id={id}
                type="radio"
                name={field.name}
                value={value}
                checked={selected}
                onChange={() => field.handleChange(value)}
                className="sr-only"
              />
              <Icon className="size-5 text-primary" aria-hidden />
              <span className="text-sm font-semibold">{t(ACCOUNT_TYPE_LABEL[value].title)}</span>
              <span className="text-xs leading-snug text-muted-foreground">
                {t(ACCOUNT_TYPE_LABEL[value].hint)}
              </span>
              <span
                aria-hidden
                className={cn(
                  'absolute end-2.5 top-2.5 flex size-4 items-center justify-center rounded-full border transition-all',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input opacity-60',
                )}
              >
                <Check className={cn('size-3', selected ? 'opacity-100' : 'opacity-0')} />
              </span>
            </label>
          )
        })}
      </div>
      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
    </Field>
  )
}

/** Step 1: who the user is. */
export function AboutFields({ form }: { form: ProfileForm }) {
  const { t } = useI18n()
  const schemas = fieldSchemas(t)
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="firstName" validators={{ onChange: schemas.firstName }}>
          {(field) => (
            <TextField
              field={field}
              label={t('onboarding.field.firstName')}
              placeholder={t('onboarding.placeholder.firstName')}
              autoComplete="given-name"
            />
          )}
        </form.Field>
        <form.Field name="lastName" validators={{ onChange: schemas.lastName }}>
          {(field) => (
            <TextField
              field={field}
              label={t('onboarding.field.lastName')}
              placeholder={t('onboarding.placeholder.lastName')}
              autoComplete="family-name"
            />
          )}
        </form.Field>
      </div>
      <form.Field name="accountType">{(field) => <AccountTypeField field={field} />}</form.Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="preferredLocale">
          {(field) => (
            <SelectField
              field={field}
              label={t('onboarding.field.preferredLocale')}
              hint={t('onboarding.field.preferredLocaleHint')}
              options={SUPPORTED_LOCALES.map((value) => ({ value, label: t(LOCALE_LABEL[value]) }))}
            />
          )}
        </form.Field>
        <form.Field name="governorate">
          {(field) => (
            <SelectField
              field={field}
              label={t('onboarding.field.governorate')}
              hint={t('onboarding.field.governorateHint')}
              placeholder={t('onboarding.placeholder.select')}
              options={GOVERNORATES.map((value) => ({ value, label: t(governorateLabel(value)) }))}
            />
          )}
        </form.Field>
      </div>
    </>
  )
}

/** Step 2: the company. Required for businesses, optional for professionals. */
export function CompanyFields({ form }: { form: ProfileForm }) {
  const { t } = useI18n()
  const schemas = fieldSchemas(t)
  return (
    <>
      <form.Subscribe selector={(state) => state.values.accountType}>
        {(accountType) => (
          <form.Field
            name="companyName"
            validators={{
              onChange: ({ value, fieldApi }) =>
                companyNameError(value, fieldApi.form.getFieldValue('accountType'), t),
            }}
          >
            {(field) => (
              <TextField
                field={field}
                label={
                  accountType === AccountType.PROFESSIONAL
                    ? t('onboarding.field.firmName')
                    : t('onboarding.field.companyName')
                }
                placeholder={t('onboarding.placeholder.companyName')}
                hint={
                  accountType === AccountType.PROFESSIONAL ? t('onboarding.field.firmNameHint') : undefined
                }
                autoComplete="organization"
              />
            )}
          </form.Field>
        )}
      </form.Subscribe>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="legalForm">
          {(field) => (
            <SelectField
              field={field}
              label={t('onboarding.field.legalForm')}
              placeholder={t('onboarding.placeholder.select')}
              options={LEGAL_FORMS.map((value) => ({ value, label: t(LEGAL_FORM_LABEL[value]) }))}
            />
          )}
        </form.Field>
        <form.Field name="companyStage">
          {(field) => (
            <SelectField
              field={field}
              label={t('onboarding.field.companyStage')}
              hint={t('onboarding.field.companyStageHint')}
              placeholder={t('onboarding.placeholder.select')}
              options={COMPANY_STAGES.map((value) => ({ value, label: t(COMPANY_STAGE_LABEL[value]) }))}
            />
          )}
        </form.Field>
      </div>
      <form.Field name="taxId" validators={{ onChange: schemas.taxId }}>
        {(field) => (
          <TextField
            field={field}
            label={t('onboarding.field.taxId')}
            placeholder="1234567A/M/A/000"
            hint={t('onboarding.field.taxIdHint')}
            autoComplete="off"
          />
        )}
      </form.Field>
    </>
  )
}

/** Step 3: how to reach the user. */
export function ContactFields({ form }: { form: ProfileForm }) {
  const { t } = useI18n()
  const schemas = fieldSchemas(t)
  return (
    <>
      <form.Field name="phone" validators={{ onChange: schemas.phone }}>
        {(field) => (
          <TextField
            field={field}
            label={t('onboarding.field.phone')}
            placeholder="+216 12 345 678"
            hint={t('onboarding.field.phoneHint')}
            autoComplete="tel"
          />
        )}
      </form.Field>
    </>
  )
}

/** Terms checkbox, onboarding only: the account page never asks twice. */
export function TermsField({ form }: { form: ProfileForm }) {
  const { t } = useI18n()
  const schemas = fieldSchemas(t)
  return (
    <form.Field name="acceptTerms" validators={{ onChange: schemas.acceptTerms }}>
      {(field) => {
        const invalid = isInvalid(field)
        return (
          <Field orientation="horizontal" data-invalid={invalid || undefined}>
            <Checkbox
              id={field.name}
              name={field.name}
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
              onBlur={field.handleBlur}
              aria-invalid={invalid || undefined}
            />
            <FieldContent>
              <FieldLabel htmlFor={field.name}>{t('onboarding.field.acceptTerms')}</FieldLabel>
              {invalid ? (
                <FieldError errors={field.state.meta.errors} />
              ) : (
                <FieldDescription>{t('onboarding.field.acceptTermsHint')}</FieldDescription>
              )}
            </FieldContent>
          </Field>
        )
      }}
    </form.Field>
  )
}
