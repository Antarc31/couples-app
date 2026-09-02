// =============================================================================
// Edge Function: send-push
// =============================================================================
// Fase 2, docs/PLAN.md -> "Architettura tecnica": "Notifiche push: Web Push
// standard (VAPID) via Supabase Edge Functions". Invia una notifica push al
// dispositivo/i di un membro della coppia dell'utente autenticato che
// effettua la chiamata (tipicamente: "il tuo partner ti ha mandato un
// pensiero", "nuovo appuntamento confermato", promemoria calendario, ecc. —
// la scelta di QUANDO chiamare questa funzione è responsabilità del
// frontend/altri trigger applicativi, questa funzione fa solo la consegna).
//
// =============================================================================
// STATO: CODICE PRONTO, NON ANCORA DEPLOYATO — vedi HANDOFF.md
// =============================================================================
// backend2 non ha le credenziali del progetto Supabase e non può eseguire un
// `supabase login` interattivo via browser in questo ambiente sandbox. Questo
// file è scritto e revisionato con cura ma NON è stato deployato. Non è un
// blocco per il resto della Fase 2 (appointments/wishlist non dipendono da
// questa funzione) — resta "pronto" finché l'utente non fa login CLI di
// persona. Quando lo fa, passi per andare live:
//
//   1. Genera UNA coppia di chiavi VAPID (una tantum per l'intero progetto,
//      non per-ambiente/per-deploy):
//        npx web-push generate-vapid-keys
//      Stampa due valori: "Public Key" e "Private Key". Salvale da qualche
//      parte sicuro (es. password manager) — la private key non si può
//      recuperare se persa, andrebbe rigenerata (e tutte le sottoscrizioni
//      push esistenti invalidate/da ri-creare lato client).
//
//   2. Login CLI (una tantum, interattivo via browser):
//        npx supabase login
//
//   3. Link al progetto (se non già fatto per le migration):
//        npx supabase link --project-ref <ref del progetto>
//
//   4. Configura i secrets della function (MAI committare le chiavi nel
//      repo, MAI metterle in .env.local che finisce nel bundle client):
//        npx supabase secrets set VAPID_PUBLIC_KEY=<public key dal passo 1>
//        npx supabase secrets set VAPID_PRIVATE_KEY=<private key dal passo 1>
//        npx supabase secrets set VAPID_SUBJECT=mailto:<email di contatto reale>
//      (VAPID_SUBJECT è un "mailto:" o URL https: che identifica chi invia
//      le notifiche, richiesto dallo standard Web Push — i push service lo
//      usano per contattarti se c'è un problema con l'invio.)
//      SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY NON vanno impostati a mano:
//      sono iniettati automaticamente nell'ambiente di ogni Edge Function
//      deployata da Supabase.
//
//   5. Deploy:
//        npx supabase functions deploy send-push
//
//   6. La VAPID_PUBLIC_KEY (SOLO quella pubblica, mai la privata) va anche
//      esposta al frontend per la subscribe() del service worker lato
//      browser — es. NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.local — vedi
//      lib/push-actions.ts per dove viene consumata.
//
// =============================================================================
// Contratto HTTP
// =============================================================================
// POST, richiede header `Authorization: Bearer <access token dell'utente>`
// (la verifica JWT di base è quella di default delle Edge Function Supabase,
// NON deployare con --no-verify-jwt).
//
// Body JSON:
//   { targetUserId: string; title: string; body: string; url?: string }
//
// Autorizzazione applicativa (oltre al JWT valido): il chiamante deve
// appartenere alla STESSA coppia di targetUserId — verificato qui sotto
// usando un client Supabase "per-utente" (che rispetta la RLS del
// chiamante: la policy `profiles_select_self_or_partner` gli permette già
// di leggere sia il proprio profilo sia quello del partner, quindi basta
// confrontare i due couple_id, non serve service role per questo controllo).
// Il service role entra in gioco SOLO dopo, per leggere le
// push_subscriptions del DESTINATARIO (che la RLS nega al chiamante, per
// design — vedi 20260901030000_push_subscriptions.sql).
//
// Risposta: { sent: number; failed: number; removedExpired: number }
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendPushRequest {
  targetUserId: string;
  title: string;
  body: string;
  url?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo non consentito, usa POST." }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    // Questi tre sono iniettati automaticamente dalla piattaforma: se
    // mancano, la function non è stata deployata correttamente, non è un
    // problema di configurazione utente.
    return jsonResponse({ error: "Configurazione ambiente Supabase mancante." }, 500);
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    return jsonResponse(
      {
        error:
          "Chiavi VAPID non configurate. Vedi il commento in testa a questo file per generarle e impostarle come secrets.",
      },
      500,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Header Authorization mancante." }, 401);
  }

  let payload: SendPushRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON non valido." }, 400);
  }

  const { targetUserId, title, body, url } = payload;
  if (!targetUserId || !title || !body) {
    return jsonResponse({ error: "targetUserId, title e body sono obbligatori." }, 400);
  }

  // Client "per-utente": rispetta la RLS del chiamante (identificato dal suo
  // JWT), usato SOLO per verificare l'identità e l'appartenenza alla coppia.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
    error: authError,
  } = await callerClient.auth.getUser();

  if (authError || !caller) {
    return jsonResponse({ error: "Utente non autenticato." }, 401);
  }

  const { data: myProfile } = await callerClient
    .from("profiles")
    .select("couple_id")
    .eq("id", caller.id)
    .maybeSingle();

  const { data: targetProfile } = await callerClient
    .from("profiles")
    .select("couple_id")
    .eq("id", targetUserId)
    .maybeSingle();

  // Se targetProfile è null qui, o il chiamante non vede quel profilo (RLS lo
  // nasconderebbe già se non fosse il partner), oppure l'utente non esiste:
  // in entrambi i casi non deve poter mandare push a chiunque a piacere.
  if (
    !myProfile?.couple_id ||
    !targetProfile?.couple_id ||
    myProfile.couple_id !== targetProfile.couple_id
  ) {
    return jsonResponse(
      { error: "Il destinatario non è il tuo partner (o non sei accoppiato/a)." },
      403,
    );
  }

  // Da qui in poi: service role, bypassa RLS. Necessario per leggere le
  // push_subscriptions del DESTINATARIO (RLS le nega al chiamante per
  // design). L'autorizzazione applicativa è già stata verificata sopra.
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: subscriptions, error: subsError } = await serviceClient
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", targetUserId);

  if (subsError) {
    return jsonResponse({ error: `Errore lettura sottoscrizioni: ${subsError.message}` }, 500);
  }

  if (!subscriptions || subscriptions.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, removedExpired: 0 });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const notificationPayload = JSON.stringify({ title, body, url: url ?? "/" });

  let sent = 0;
  let failed = 0;
  let removedExpired = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          notificationPayload,
        );
        sent++;
      } catch (err) {
        failed++;
        // 404/410 = sottoscrizione non più valida lato push service (utente
        // ha disinstallato la PWA, revocato il permesso, ecc.): puliamo la
        // riga invece di ritentare all'infinito ad ogni invio futuro.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await serviceClient.from("push_subscriptions").delete().eq("id", sub.id);
          removedExpired++;
        } else {
          console.error(`send-push: invio fallito per subscription ${sub.id}:`, err);
        }
      }
    }),
  );

  return jsonResponse({ sent, failed, removedExpired });
});
