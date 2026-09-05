"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPairingInvite, acceptPairingInvite, getSession, signOut } from "@/lib/auth-actions";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";

type Tab = "generate" | "accept";

export default function PairingClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("generate");

  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [inputCode, setInputCode] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [pairedWith, setPairedWith] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Bug segnalato dall'utente: chi genera il codice restava bloccato sulla
  // schermata anche a pairing già avvenuto (accept_pairing_invite collega
  // ENTRAMBI i profiles nella stessa transazione — verificato via query
  // diretta sul DB — ma prima nulla ricontrollava mai lato client se nel
  // frattempo il partner aveva accettato). Poll leggero su getSession()
  // finché il codice è a schermo: appena couple_id compare, si passa alla
  // Home in automatico, senza dover ricaricare la pagina a mano.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      const session = await getSession();
      if (!cancelled && session?.coupleId) {
        clearInterval(interval);
        router.push("/home");
        router.refresh();
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [code, router]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    const result = await createPairingInvite();
    setGenerating(false);
    if ("error" in result) {
      setGenerateError(result.error);
      return;
    }
    setCode(result.code);
  }

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard non disponibile (es. contesto non sicuro): non bloccante,
      // il codice resta comunque visibile e selezionabile a mano.
    }
  }

  async function handleAccept(e: FormEvent) {
    e.preventDefault();
    setAccepting(true);
    setAcceptError(null);
    const result = await acceptPairingInvite(inputCode);
    setAccepting(false);
    if ("error" in result) {
      setAcceptError(result.error);
      return;
    }
    setPairedWith(result.partnerName);
  }

  if (pairedWith) {
    return (
      <Card className="flex w-full flex-col items-center gap-4 text-center">
        <span className="text-4xl">🎉</span>
        <p className="text-lg font-bold text-ink">Accoppiato/a con {pairedWith}!</p>
        <Button size="lg" className="w-full" onClick={() => router.push("/home")}>
          Vai alla Home
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex rounded-2xl bg-partner-b-soft/50 p-1">
        {(["generate", "accept"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              tab === t ? "bg-surface on-surface text-ink shadow-sm" : "text-ink-soft"
            }`}
          >
            {t === "generate" ? "Genera codice" : "Ho un codice"}
          </button>
        ))}
      </div>

      {tab === "generate" ? (
        <Card className="flex flex-col items-center gap-4 text-center">
          {code ? (
            <>
              <p className="text-sm text-ink-soft">Condividi questo codice col tuo partner:</p>
              <p className="rounded-2xl bg-partner-b-soft on-surface px-6 py-3 font-mono text-3xl font-extrabold tracking-[0.3em] text-ink">
                {code}
              </p>
              <Button variant="secondary" onClick={handleCopy} className="w-full">
                {copied ? "Copiato ✓" : "Copia codice"}
              </Button>
              <p className="text-xs text-ink-soft">In attesa che il partner inserisca il codice… si passa alla Home in automatico appena vi accoppiate.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-soft">
                Genera un codice univoco, valido per un periodo limitato, da
                mandare al tuo partner.
              </p>
              <Button size="lg" className="w-full" onClick={handleGenerate} disabled={generating}>
                {generating ? "Un attimo…" : "Genera codice"}
              </Button>
            </>
          )}
          {generateError && (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{generateError}</p>
          )}
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleAccept} className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">Inserisci il codice ricevuto dal tuo partner:</p>
            <Input
              type="text"
              placeholder="ES. 7K4QXPMN"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              className="text-center font-mono text-lg tracking-[0.2em]"
              required
            />
            {acceptError && (
              <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{acceptError}</p>
            )}
            <Button type="submit" size="lg" disabled={accepting}>
              {accepting ? "Un attimo…" : "Accoppiati"}
            </Button>
          </form>
        </Card>
      )}

      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.push("/login");
          router.refresh();
        }}
        className="text-center text-sm text-ink-soft underline underline-offset-2"
      >
        Esci
      </button>
    </div>
  );
}
