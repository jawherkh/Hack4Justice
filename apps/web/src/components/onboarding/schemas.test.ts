import { describe, expect, it } from 'vitest'
import { createTranslator } from '#/i18n'
import { companyNameError, emptyValues, fieldSchemas, splitName, toProfileInput } from './schemas'

const t = createTranslator('en')

describe('splitName', () => {
  it('takes the first word as first name and the rest as last name', () => {
    expect(splitName('Amina Ben Salah')).toEqual({ firstName: 'Amina', lastName: 'Ben Salah' })
    expect(splitName('  Amina ')).toEqual({ firstName: 'Amina', lastName: '' })
    expect(splitName('')).toEqual({ firstName: '', lastName: '' })
  })
})

describe('fieldSchemas', () => {
  const schemas = fieldSchemas(t)

  it('requires names and caps their length', () => {
    expect(schemas.firstName.safeParse('   ').success).toBe(false)
    expect(schemas.firstName.safeParse('Amina').success).toBe(true)
    expect(schemas.lastName.safeParse('x'.repeat(61)).success).toBe(false)
  })

  it('checks the matricule fiscal format after normalizing, blank allowed', () => {
    expect(schemas.taxId.safeParse('').success).toBe(true)
    expect(schemas.taxId.safeParse('1234567a').success).toBe(true)
    expect(schemas.taxId.safeParse('1234567 a / m / a / 000').success).toBe(true)
    expect(schemas.taxId.safeParse('1234567A/M/000').success).toBe(false)
    expect(schemas.taxId.safeParse('12345').success).toBe(false)
    expect(schemas.taxId.safeParse('ABCDEFGH').success).toBe(false)
  })

  it('checks Tunisian phone numbers, blank allowed', () => {
    expect(schemas.phone.safeParse('').success).toBe(true)
    expect(schemas.phone.safeParse('+216 12-345-678').success).toBe(true)
    expect(schemas.phone.safeParse('12 345 678').success).toBe(true)
    expect(schemas.phone.safeParse('1234').success).toBe(false)
  })

  it('only accepts true for the terms', () => {
    expect(schemas.acceptTerms.safeParse(false).success).toBe(false)
    expect(schemas.acceptTerms.safeParse(true).success).toBe(true)
  })
})

describe('companyNameError', () => {
  it('requires a company name for businesses but not professionals', () => {
    expect(companyNameError('', 'business', t)).toEqual({
      message: 'Company name is required for a business account.',
    })
    expect(companyNameError('', 'professional', t)).toBeUndefined()
    expect(companyNameError('Dalil', 'business', t)).toBeUndefined()
    expect(companyNameError('x'.repeat(121), 'professional', t)?.message).toMatch(/at most 120/)
  })
})

describe('toProfileInput', () => {
  it('trims, normalizes and drops blanks', () => {
    const values = {
      ...emptyValues('fr'),
      firstName: ' Amina ',
      lastName: 'Ben Salah',
      companyName: 'Dalil',
      legalForm: 'sarl',
      taxId: '1234567a/m/a/000',
      phone: '12 345 678',
      acceptTerms: true,
    }
    expect(toProfileInput(values)).toEqual({
      firstName: 'Amina',
      lastName: 'Ben Salah',
      accountType: 'business',
      preferredLocale: 'fr',
      governorate: undefined,
      companyName: 'Dalil',
      legalForm: 'sarl',
      companyStage: undefined,
      taxId: '1234567A/M/A/000',
      phone: '12345678',
      acceptTerms: true,
    })
  })
})
