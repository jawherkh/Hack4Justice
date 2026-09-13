import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '#/test/render'
import { OnboardingWizard } from './onboarding-wizard'

const saveProfile = vi.fn()
vi.mock('#/lib/profile', () => ({
  profileKeys: { me: ['profile', 'me'] },
  saveProfile: (...args: unknown[]) => saveProfile(...args),
}))
vi.mock('@hack4justice/ui/components/toast', () => ({ toast: { add: vi.fn() } }))

function renderWizard() {
  const client = new QueryClient()
  return renderWithApp(
    <QueryClientProvider client={client}>
      <OnboardingWizard name="Amina Ben Salah" redirectTo="/projects" />
    </QueryClientProvider>,
  )
}

describe('OnboardingWizard', () => {
  beforeEach(() => saveProfile.mockReset())

  it('stays on the first step until the names are filled in', async () => {
    const user = userEvent.setup()
    renderWizard()
    expect(await screen.findByLabelText('First name')).toHaveValue('Amina')
    expect(screen.getByLabelText('Last name')).toHaveValue('Ben Salah')
    expect(screen.getByRole('radio', { name: /Business/ })).toBeChecked()

    await user.clear(screen.getByLabelText('Last name'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument()

    // Error clears as the user types, then the step advances.
    await user.type(screen.getByLabelText('Last name'), 'Trabelsi')
    expect(screen.queryByText('This field is required.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByLabelText('Company name')).toBeInTheDocument()
  })

  it('requires a company name and a well-formed tax id for businesses', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByLabelText('First name')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByLabelText('Company name')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Company name is required for a business account.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Company name'), 'Dalil')
    await user.type(screen.getByLabelText('Tax identifier (matricule fiscal)'), '12345')
    expect(await screen.findByText(/Use 7 digits and a letter/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    expect(saveProfile).not.toHaveBeenCalled()
  })

  it('lets professionals skip the firm name and blocks the last step until terms are accepted', async () => {
    const user = userEvent.setup()
    renderWizard()
    await screen.findByLabelText('First name')
    await user.click(screen.getByRole('radio', { name: /Professional/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByLabelText('Firm name')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByLabelText('Phone')

    await user.click(screen.getByRole('button', { name: 'Finish setup' }))
    expect(await screen.findByText('You must accept the terms to continue.')).toBeInTheDocument()
    expect(saveProfile).not.toHaveBeenCalled()
  })

  it('submits the normalized payload and supports going back', async () => {
    saveProfile.mockResolvedValue({ firstName: 'Amina' })
    const user = userEvent.setup()
    renderWizard()
    await screen.findByLabelText('First name')
    await user.selectOptions(screen.getByLabelText('Preferred language'), 'fr')
    await user.selectOptions(screen.getByLabelText('Governorate'), 'sfax')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.type(await screen.findByLabelText('Company name'), 'Dalil')
    await user.selectOptions(screen.getByLabelText('Legal form'), 'sarl')
    await user.type(screen.getByLabelText('Tax identifier (matricule fiscal)'), '1234567 a/m/a/000')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByLabelText('First name')).toHaveValue('Amina')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    // Values survive a round trip through the previous step.
    expect(await screen.findByLabelText('Company name')).toHaveValue('Dalil')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.type(await screen.findByLabelText('Phone'), '+216 12 345 678')
    await user.click(
      screen.getByRole('checkbox', { name: 'I agree to the Terms of Service and Privacy Policy' }),
    )
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1))
    expect(saveProfile).toHaveBeenCalledWith({
      firstName: 'Amina',
      lastName: 'Ben Salah',
      accountType: 'business',
      preferredLocale: 'fr',
      governorate: 'sfax',
      companyName: 'Dalil',
      legalForm: 'sarl',
      companyStage: undefined,
      taxId: '1234567A/M/A/000',
      phone: '+21612345678',
      acceptTerms: true,
    })
  })
})
