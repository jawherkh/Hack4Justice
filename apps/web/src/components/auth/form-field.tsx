import type { AnyFieldApi } from '@tanstack/react-form'
import { Field, FieldDescription, FieldError, FieldLabel } from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'

interface TextFieldProps {
  field: AnyFieldApi
  label: string
  placeholder?: string
  hint?: string
  type?: 'text' | 'email' | 'password'
  autoComplete?: string
}

/** Input bound to a TanStack Form field, with shadcn Field chrome and translated errors. */
export function TextField({ field, label, placeholder, hint, type = 'text', autoComplete }: TextFieldProps) {
  const invalid = field.state.meta.isTouched && field.state.meta.errors.length > 0
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={String(field.state.value ?? '')}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={invalid || undefined}
      />
      {invalid ? (
        <FieldError errors={field.state.meta.errors} />
      ) : hint ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : null}
    </Field>
  )
}
