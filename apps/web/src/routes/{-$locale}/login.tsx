import { createFileRoute } from '@tanstack/react-router'
import { LoginForm } from '#/components/auth/login-form'

export const Route = createFileRoute('/{-$locale}/login')({ component: Login })

function Login() {
  return (
    <main className="flex flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  )
}
