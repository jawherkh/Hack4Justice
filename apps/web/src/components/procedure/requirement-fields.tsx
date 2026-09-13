import { fieldsFor, type FieldDef, type FieldError } from '@hack4justice/shared'
import {
  Field,
  FieldDescription,
  FieldError as FieldErrorText,
  FieldLabel,
} from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import { Textarea } from '@hack4justice/ui/components/textarea'
import { useI18n, type MessageKey } from '#/i18n'

export const fieldLabel = (requirementId: string, key: string) =>
  `procedure.field.${requirementId}.${key}` as MessageKey

interface RequirementFieldsProps {
  requirementId: string
  value: Record<string, string>
  errors: Record<string, FieldError>
  onChange: (key: string, value: string) => void
}

/** Typed inputs for a requirement's catalog fields, plus a free-text "other details" box. */
export function RequirementFields({ requirementId, value, errors, onChange }: RequirementFieldsProps) {
  const { t } = useI18n()
  const fields = fieldsFor(requirementId)

  const errorText = (field: FieldDef, error: FieldError | undefined) => {
    if (!error) return null
    if (error === 'pattern') return t('procedure.field.error.pattern', { example: field.example ?? '' })
    return t(`procedure.field.error.${error}` as MessageKey)
  }

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => {
        const id = `field-${requirementId}-${field.key}`
        const error = errors[field.key]
        const label = t(fieldLabel(requirementId, field.key))
        return (
          <Field key={field.key} data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={id}>
              {label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </FieldLabel>
            {field.type === 'textarea' ? (
              <Textarea
                id={id}
                rows={3}
                value={value[field.key] ?? ''}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={field.example}
                aria-invalid={error ? true : undefined}
              />
            ) : (
              <Input
                id={id}
                type={field.type === 'number' ? 'text' : field.type}
                inputMode={field.type === 'number' ? 'decimal' : undefined}
                value={value[field.key] ?? ''}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={field.example}
                aria-invalid={error ? true : undefined}
              />
            )}
            {error ? (
              <FieldErrorText>{errorText(field, error)}</FieldErrorText>
            ) : field.example && field.pattern ? (
              <FieldDescription>{field.example}</FieldDescription>
            ) : null}
          </Field>
        )
      })}
      <Field>
        <FieldLabel htmlFor={`field-${requirementId}-details`}>
          {t('procedure.field.otherDetails')}
        </FieldLabel>
        <Textarea
          id={`field-${requirementId}-details`}
          rows={2}
          value={value['details'] ?? ''}
          onChange={(event) => onChange('details', event.target.value)}
          placeholder={t('procedure.requirement.detailsPlaceholder')}
        />
      </Field>
    </div>
  )
}
