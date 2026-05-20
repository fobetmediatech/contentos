/**
 * Layout for all unauthenticated auth flows: /login, /forgot-password,
 * /reset-password, /check-email.
 *
 * Renders children directly — each page uses `<AuthCard>` from
 * `components/shared/` for the centered-card chrome. proxy.ts handles
 * the redirect away if a signed-in user lands here.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
