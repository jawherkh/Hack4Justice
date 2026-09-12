import { createFileRoute } from '@tanstack/react-router'
import { SignupForm } from '#/components/auth/signup-form'

export const Route = createFileRoute('/{-$locale}/register')({ component: Register })

function Register() {
  return (
    <main className="flex min-h-[calc(100svh-3.5rem)] w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignupForm />
      </div>
    </main>
  )
}
