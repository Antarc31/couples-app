import LoginForm from "@/components/auth/LoginForm";

/**
 * `?error=conferma_non_riuscita` arriva da app/auth/callback/route.ts quando
 * `exchangeCodeForSession` fallisce (link di conferma/recupero scaduto, già
 * usato, o aperto in un browser/dispositivo diverso da quello con cui è
 * stato richiesto — il code_verifier PKCE vive in un cookie del browser di
 * origine). Prima questo query param veniva generato ma MAI letto: l'utente
 * atterrava su un login "vuoto" senza nessuna spiegazione del perché il link
 * non avesse funzionato. Letto qui (Server Component, niente useSearchParams
 * lato client) e passato come messaggio iniziale a LoginForm.
 */
const ERROR_MESSAGES: Record<string, string> = {
  conferma_non_riuscita:
    "Il link non è più valido: forse è scaduto, è già stato usato, oppure l'hai aperto in un browser o dispositivo diverso da quello con cui l'hai richiesto. Prova a richiederne uno nuovo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-couple-soft text-3xl">
          💗
        </span>
        <h1 className="text-2xl font-extrabold text-ink">Couples</h1>
        <p className="text-sm text-ink-soft">
          La vostra dashboard di coppia: calendario, pensieri e appuntamenti,
          tutto in un posto solo.
        </p>
      </div>
      <LoginForm initialError={error ? (ERROR_MESSAGES[error] ?? null) : null} />
    </div>
  );
}
