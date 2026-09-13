import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '#/test/render'
import { LoginForm } from './login-form'

const signInEmail = vi.fn()
vi.mock('#/lib/auth', () => ({
  signIn: { email: (...args: unknown[]) => signInEmail(...args) },
}))

describe('LoginForm', () => {
  beforeEach(() => signInEmail.mockReset())

  it('shows translated validation messages and does not submit when fields are invalid', async () => {
    const user = userEvent.setup()
    renderWithApp(<LoginForm redirectTo="/" />)
    await screen.findByText('Login to your account')

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Login' }))

    expect(await screen.findByText('Invalid email address.')).toBeInTheDocument()
    expect(await screen.findByText('Password is required.')).toBeInTheDocument()
    expect(signInEmail).not.toHaveBeenCalled()
  })

  it('submits credentials and surfaces the mapped API error', async () => {
    signInEmail.mockResolvedValue({ error: { code: 'INVALID_EMAIL_OR_PASSWORD' } })
    const user = userEvent.setup()
    renderWithApp(<LoginForm redirectTo="/" />)
    await screen.findByText('Login to your account')

    await user.type(screen.getByLabelText('Email'), 'aziz@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() =>
      expect(signInEmail).toHaveBeenCalledWith({ email: 'aziz@example.com', password: 'correct-horse-battery' }),
    )
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
  })

  it('renders in French by default locale', async () => {
    renderWithApp(<LoginForm redirectTo="/" />, { locale: 'fr' })
    expect(await screen.findByText('Connexion à votre compte')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('vous@exemple.tn')).toBeInTheDocument()
  })
})
