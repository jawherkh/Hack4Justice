import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '#/test/render'
import { SignupForm } from './signup-form'

const signUpEmail = vi.fn()
vi.mock('#/lib/auth', () => ({
  signUp: { email: (...args: unknown[]) => signUpEmail(...args) },
}))

async function fill(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await user.type(screen.getByLabelText(label), value)
  }
}

describe('SignupForm', () => {
  beforeEach(() => signUpEmail.mockReset())

  it('rejects a short password and a mismatching confirmation', async () => {
    const user = userEvent.setup()
    renderWithApp(<SignupForm redirectTo="/" />)
    await screen.findByText('Create your account')

    await fill(user, {
      'Full name': 'Aziz',
      Email: 'aziz@example.com',
      Password: 'short',
      'Confirm password': 'other',
    })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(signUpEmail).not.toHaveBeenCalled()
  })

  it('submits name, email and password only', async () => {
    signUpEmail.mockResolvedValue({ error: { code: 'USER_ALREADY_EXISTS' } })
    const user = userEvent.setup()
    renderWithApp(<SignupForm redirectTo="/" />)
    await screen.findByText('Create your account')

    await fill(user, {
      'Full name': 'Aziz',
      Email: 'aziz@example.com',
      Password: 'correct-horse-battery',
      'Confirm password': 'correct-horse-battery',
    })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() =>
      expect(signUpEmail).toHaveBeenCalledWith({
        name: 'Aziz',
        email: 'aziz@example.com',
        password: 'correct-horse-battery',
      }),
    )
    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument()
  })
})
