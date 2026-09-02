import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PairingClient from "@/components/auth/PairingClient";

export default async function PairingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.couple_id) redirect("/home");

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-partner-b-soft text-3xl">
          🔗
        </span>
        <h1 className="text-2xl font-extrabold text-ink">Trova il tuo partner</h1>
        <p className="text-sm text-ink-soft">
          Genera un codice da condividere, oppure inserisci quello ricevuto dal
          tuo partner per accoppiarvi.
        </p>
      </div>
      <PairingClient />
    </div>
  );
}
