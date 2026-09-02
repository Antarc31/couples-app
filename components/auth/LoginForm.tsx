"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-actions";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Mode = "login" | "signup";

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

    if (mode === "signup") {
      const result = await signUp({ email, password, displayName });
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Se il progetto Supabase richiede conferma email non c'è ancora una
      // sessione attiva: non assumiamo login automatico, mandiamo l'utente
      // sulla tab "Accedi" con un avviso.
      setMode("login");
      setPassword("");
      setNotice("Registrazione completata. Se richiesto, conferma l'email ricevuta, poi accedi qui sotto.");
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
