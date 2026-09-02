/**
 * Shell per le schermate di onboarding (login/signup, pairing): sfondo
 * gradiente rosa/azzurro tenue, contenuto centrato, nessuna tab bar (vedi
 * docs/PLAN.md -> "Onboarding / Auth").
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-5 py-10"
      style={{
        background:
          "radial-gradient(circle at 20% 15%, var(--color-partner-a-soft), transparent 55%), radial-gradient(circle at 85% 85%, var(--color-partner-b-soft), transparent 55%), var(--color-base)",
      }}
    >
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
