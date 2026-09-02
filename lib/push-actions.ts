"use client";

/**
 * Azioni per le notifiche push (Web Push standard, VAPID) — Fase 2,
 * docs/PLAN.md. Lato ricezione: vedi gli handler `push`/`notificationclick`
 * in public/sw.js. Lato invio: vedi supabase/functions/send-push/index.ts.
 *
 * STATO: pronto ma non deployato (vedi HANDOFF.md) — main non ha ancora
 * fatto login CLI per generare/impostare le chiavi VAPID né per il deploy
 * della Edge Function. Fino ad allora:
 *   - `subscribeToPush()` fallisce con un errore leggibile se
 *     NEXT_PUBLIC_VAPID_PUBLIC_KEY non è impostata in .env.local.
 *   - `sendPushToPartner()` (se mai chiamata) fallirà con un errore di rete/
 *     404 perché la function non è deployata — non chiamarla da UI finché
 *     backend2/main non confermano il deploy.
 * Non è un blocco per il resto della Fase 2: la tabella `push_subscriptions`
 * può comunque esistere ed essere "live" indipendentemente dal deploy della
 * function (le subscribe si accumulano già, pronte per quando la function
 * andrà live).
 */

import { createClient } from "@/lib/supabase/client";

export interface ActionError {
  error: string;
}

/** true se questo browser supporta Push API + Service Worker (falso su iOS < 16.4 in modalità browser, vedi docs/PLAN.md). */
export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// La Push API vuole la VAPID public key come Uint8Array (formato "urlsafe
// base64" convertito), non come stringa: helper di conversione standard,
// nessuna libreria necessaria per questo singolo passaggio lato browser.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Chiede il permesso di notifica al browser (se non già concesso/negato),
 * sottoscrive questo dispositivo alle push e salva la sottoscrizione in
 * `push_subscriptions` (upsert su endpoint, vedi commento nella migration).
 */
export async function subscribeToPush(): Promise<true | ActionError> {
  if (!isPushSupported()) return { error: "Le notifiche push non sono supportate su questo browser/dispositivo." };

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return {
      error:
        "Chiave VAPID pubblica non configurata (NEXT_PUBLIC_VAPID_PUBLIC_KEY). Le notifiche push non sono ancora attive su questo ambiente.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { error: "Permesso di notifica negato." };
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // `as BufferSource`: lib.dom typa applicationServerKey come
      // ArrayBuffer-backed view stretta; il Uint8Array che costruiamo è
      // compatibile a runtime (è esattamente il formato richiesto dalla Push
      // API), la stretta tipizzazione di TS su ArrayBufferLike/
      // SharedArrayBuffer qui è un falso positivo del lib target.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const authKey = json.keys?.auth;
  if (!json.endpoint || !p256dh || !authKey) {
    return { error: "Sottoscrizione push incompleta (mancano endpoint/chiavi)." };
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );

  if (error) return { error: error.message };
  return true;
}

/** Disiscrive questo dispositivo (browser + riga push_subscriptions). */
export async function unsubscribeFromPush(): Promise<true | ActionError> {
  if (!isPushSupported()) return true; // niente da disiscrivere

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const supabase = createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { error: error.message };
  return true;
}

/**
 * Invoca la Edge Function `send-push` per notificare il partner. Vedi nota
 * di stato in testa al file: non chiamare da UI finché la function non è
 * confermata deployata da main.
 */
export async function sendPushToPartner(params: {
  targetUserId: string;
  title: string;
  body: string;
  url?: string;
}): Promise<{ sent: number; failed: number } | ActionError> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("send-push", {
    body: params,
  });
  if (error) return { error: error.message };
  return data as { sent: number; failed: number };
}
