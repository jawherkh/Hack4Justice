import { createFileRoute } from '@tanstack/react-router'
import { SignupForm } from '#/components/auth/signup-form'

export const Route = createFileRoute('/{-$locale}/register')({ component: Register })

function Register() {
  return (
    <main className="flex flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignupForm />
      </div>
    </main>
  )
}
