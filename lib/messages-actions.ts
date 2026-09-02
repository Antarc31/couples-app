"use client";

/**
 * Azioni per il widget "Pensieri & Foto" di Home (`components/home/
 * MemoriesDeck.tsx`, vedi piano approvato in
 * `/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`,
 * punto 7). Chiude il gap segnalato dal teammate "frontend": non esisteva
 * una tabella `messages` (vedi supabase/migrations/20260831190000_messages.sql).
 *
 * Stesso pattern di lib/auth-actions.ts: client browser Supabase, chiamato da
 * componenti client-side, non da Server Actions.
 */

import { createClient } from "@/lib/supabase/client";
import type { MessageType } from "@/types/database";

/** Bucket Storage privato per le foto (supabase/migrations/20260901050000_couple_photos_storage.sql). */
const PHOTO_BUCKET = "couple-photos";
/** Validità della signed URL generata per mostrare una foto (secondi). */
const SIGNED_URL_TTL_SECONDS = 3600;

export interface Thought {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  content: string;
  /**
   * Per type='photo': signed URL già risolta, pronta per <img src>. NON è
   * `messages.photo_url` grezzo (quello è il PATH nel bucket, es.
   * `{couple_id}/{uuid}.jpg` — vedi commento in testa alla migration dello
   * storage) — listRecentThoughts risolve il path in signed URL prima di
   * restituire il Thought, così i componenti non devono mai vedere il path
   * grezzo né chiamare Storage direttamente.
   * Per type='text'/'reminder': sempre null.
   */
  photoUrl: string | null;
  createdAt: string;
  likedByMe: boolean;
}

export interface ActionError {
  error: string;
}

/** Colonne condivise selezionate da listRecentThoughts/listPhotoMemories (vedi mapRowToThought). */
const MESSAGE_ROW_COLUMNS =
  "id, sender_id, type, content, photo_url, liked_by, created_at, profiles!messages_sender_id_fkey(display_name)";

interface MessageRow {
  id: string;
  sender_id: string;
  type: MessageType;
  content: string;
  photo_url: string | null;
  liked_by: string[] | null;
  created_at: string;
  profiles: unknown;
}

/**
 * Risolve in parallelo i path (bucket privato `couple-photos`) in signed URL,
 * condivisa da listRecentThoughts e listPhotoMemories per non duplicare la
 * logica di risoluzione. Una foto il cui signed URL non si riesce a generare
 * (es. file rimosso manualmente dallo Storage) degrada a `null` nella mappa
 * invece di far fallire l'intera chiamata.
 */
async function resolveSignedPhotoUrls(
  supabase: ReturnType<typeof createClient>,
  paths: string[],
): Promise<Map<string, string | null>> {
  const signedUrlByPath = new Map<string, string | null>();
  const uniquePaths = Array.from(new Set(paths));
  if (uniquePaths.length === 0) return signedUrlByPath;

  await Promise.all(
    uniquePaths.map(async (path) => {
      const { data: signed } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      signedUrlByPath.set(path, signed?.signedUrl ?? null);
    }),
  );

  return signedUrlByPath;
}

/** Mappa una riga grezza `messages` (+ profiles join) in un Thought, risolvendo la signed URL già calcolata. */
function mapRowToThought(row: MessageRow, myId: string, signedUrlByPath: Map<string, string | null>): Thought {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName:
      (row.profiles as unknown as { display_name: string | null } | null)?.display_name ?? "Partner",
    type: row.type,
    content: row.content,
    photoUrl: row.type === "photo" && row.photo_url ? (signedUrlByPath.get(row.photo_url) ?? null) : null,
    createdAt: row.created_at,
    likedByMe: (row.liked_by ?? []).includes(myId),
  };
}

/** Ultimi messaggi della coppia, più recenti prima. Le foto arrivano già con signed URL risolta. */
export async function listRecentThoughts(limit = 20): Promise<Thought[] | ActionError> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData?.user?.id;
  if (!myId) return { error: "Utente non autenticato" };

  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_ROW_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { error: error.message };

  const rows = (data ?? []) as unknown as MessageRow[];
  const signedUrlByPath = await resolveSignedPhotoUrls(
    supabase,
    rows.filter((row) => row.type === "photo" && row.photo_url).map((row) => row.photo_url as string),
  );

  return rows.map((row) => mapRowToThought(row, myId, signedUrlByPath));
}

export interface PhotoMemoriesPage {
  items: Thought[];
  /** Da passare come `before` alla chiamata successiva. `null` = nessun'altra pagina. */
  nextCursor: string | null;
}

/**
 * Galleria foto persistente (`app/(app)/home/foto/page.tsx`, componente
 * `PhotoGallery`): tutti i messaggi type='photo' della coppia, paginati a
 * cursore su `created_at` (sfrutta l'indice esistente `(couple_id,
 * created_at desc)` su `messages`, RLS già filtra per coppia). `before`
 * omesso = prima pagina (più recenti). Euristica hasMore: se la pagina
 * ritorna esattamente `limit` righe si assume che ce ne siano altre —
 * un'eventuale pagina successiva vuota costa solo una chiamata in più.
 */
export async function listPhotoMemories(before?: string, limit = 24): Promise<PhotoMemoriesPage | ActionError> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData?.user?.id;
  if (!myId) return { error: "Utente non autenticato" };

  let query = supabase.from("messages").select(MESSAGE_ROW_COLUMNS).eq("type", "photo");
  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

  if (error) return { error: error.message };

  const rows = (data ?? []) as unknown as MessageRow[];
  const signedUrlByPath = await resolveSignedPhotoUrls(
    supabase,
    rows.filter((row) => row.photo_url).map((row) => row.photo_url as string),
  );

  const items = rows.map((row) => mapRowToThought(row, myId, signedUrlByPath));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;

  return { items, nextCursor };
}

/** Invia un pensiero di testo al partner (type 'text'). Per una foto vedi sendPhotoThought. */
export async function sendThought(content: string): Promise<Thought | ActionError> {
  const trimmed = content.trim();
  if (!trimmed) return { error: "Il messaggio non può essere vuoto." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, couple_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.couple_id) return { error: "Non sei accoppiato/a con un partner." };

  const { data, error } = await supabase
    .from("messages")
    .insert({
      couple_id: profile.couple_id,
      sender_id: user.id,
      type: "text",
      content: trimmed,
    })
    .select("id, sender_id, type, content, photo_url, liked_by, created_at")
    .single();

  if (error) return { error: error.message };

  return {
    id: data.id,
    senderId: data.sender_id,
    senderName: profile.display_name ?? "Tu",
    type: data.type,
    content: data.content,
    photoUrl: data.photo_url,
    createdAt: data.created_at,
    likedByMe: false,
  };
}

/**
 * Invia una foto al partner (type 'photo'): carica il file sul bucket
 * privato `couple-photos` (path `{couple_id}/{uuid}.{ext}`, obbligatorio per
 * la RLS di storage.objects — vedi supabase/migrations/
 * 20260901050000_couple_photos_storage.sql), poi inserisce la riga in
 * `messages` con `photo_url` = path (non URL pubblico). `caption` è
 * opzionale: `messages.content` non può essere vuoto (check DB), quindi si
 * usa un placeholder quando l'utente non scrive nulla.
 *
 * Nessuna compressione/ridimensionamento lato client in questo giro (nota di
 * scope del piano) — il file viene caricato così com'è.
 */
export async function sendPhotoThought(file: File, caption?: string): Promise<Thought | ActionError> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, couple_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.couple_id) return { error: "Non sei accoppiato/a con un partner." };

  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
  const ext = (extMatch?.[1] ?? file.type.split("/")[1] ?? "jpg").toLowerCase();
  const path = `${profile.couple_id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) return { error: uploadError.message };

  const content = caption?.trim() || "📷";

  const { data, error } = await supabase
    .from("messages")
    .insert({
      couple_id: profile.couple_id,
      sender_id: user.id,
      type: "photo",
      content,
      photo_url: path,
    })
    .select("id, sender_id, type, content, photo_url, liked_by, created_at")
    .single();

  if (error) {
    // Best-effort: non lasciare un file orfano nel bucket se l'insert fallisce.
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    return { error: error.message };
  }

  const { data: signed } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return {
    id: data.id,
    senderId: data.sender_id,
    senderName: profile.display_name ?? "Tu",
    type: data.type,
    content: data.content,
    photoUrl: signed?.signedUrl ?? null,
    createdAt: data.created_at,
    likedByMe: false,
  };
}

/** RPC toggle_message_reaction: aggiunge/rimuove il cuore dell'utente corrente. Ritorna il nuovo stato. */
export async function toggleThoughtReaction(messageId: string): Promise<boolean | ActionError> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("toggle_message_reaction", { message_id: messageId });
  if (error) return { error: error.message };
  return data ?? false;
}
