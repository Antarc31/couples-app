"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { requestPasswordReset, signIn, signUp } from "@/lib/auth-actions";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Mode = "login" | "signup" | "forgot";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    if (mode === "forgot") {
      const result = await requestPasswordReset(email);
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("login");
      setNotice(`Se ${email} è registrata, ti abbiamo mandato un'email con il link per reimpostare la password.`);
      return;
    }

    if (mode === "signup") {
      const result = await signUp({ email, password, displayName });
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // needsEmailConfirmation lo sappiamo per certo da Supabase (nessuna
      // sessione creata dalla signUp), non lo indoviniamo più con un "se
      // richiesto": messaggio diverso e inequivocabile nei due casi.
      setMode("login");
      setPassword("");
      setNotice(
        result.needsEmailConfirmation
          ? `Ti abbiamo mandato un'email di conferma a ${email}. Apri il link ricevuto (controlla anche lo spam) prima di accedere: senza quello il login non funzionerà.`
          : "Registrazione completata! Accedi qui sotto.",
      );
      return;
    }

    const result = await signIn({ email, password });
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (mode === "forgot") {
    return (
      <div className="flex flex-col gap-5">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
            setNotice(null);
          }}
          className="self-start text-sm font-semibold text-ink-soft"
        >
          ‹ Torna al login
        </button>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">Inserisci la tua email: ti mandiamo un link per reimpostare la password.</p>
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />

          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <Button type="submit" size="lg" disabled={loading} className="mt-1">
            {loading ? "Un attimo…" : "Invia link di recupero"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex rounded-2xl bg-partner-a-soft/50 p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
            }`}
          >
            {m === "login" ? "Accedi" : "Registrati"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <Input
            type="text"
            placeholder="Come ti chiami?"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
          />
        )}
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />

        {mode === "login" && (
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError(null);
              setNotice(null);
            }}
            className="self-end text-xs font-semibold text-ink-soft"
          >
            Password dimenticata?
          </button>
        )}

        {error && (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
        {notice && (
          <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>
        )}

        <Button type="submit" size="lg" disabled={loading} className="mt-1">
          {loading ? "Un attimo…" : mode === "login" ? "Accedi" : "Crea account"}
        </Button>
      </form>
    </div>
  );
}
