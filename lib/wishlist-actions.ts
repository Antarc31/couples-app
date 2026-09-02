"use client";

/**
 * Azioni per la sezione Wishlist (docs/PLAN.md, Fase 2): regali/attività di
 * coppia, con modalità sorpresa e archivio "Completati" (mai delete secco).
 *
 * Stesso pattern di lib/auth-actions.ts / lib/messages-actions.ts: client
 * browser Supabase, chiamato da componenti client-side, non da Server
 * Actions.
 *
 * IMPORTANTISSIMO per chi consuma questo modulo (frontend2): la LETTURA
 * della lista condivisa DEVE passare da `listWishlistFeed()` (che legge la
 * view `wishlist_feed`), MAI da una query diretta su `wishlist_items` per
 * mostrare la lista di coppia. La view maschera i campi sensibili (title/
 * description/price/link/photoUrl → null) delle sorprese attive create dal
 * partner ed espone `isHiddenSurprise: true` così puoi renderizzare un
 * placeholder ("🎁 Sorpresa in arrivo") al posto della card normale. Una
 * query diretta su `wishlist_items` per queste righe non torna nemmeno la
 * riga (RLS le nega del tutto a chi non è il creatore) — va bene per "i miei
 * item" ma NON per la lista condivisa, altrimenti le sorprese in arrivo per
 * te spariscono silenziosamente invece di mostrarsi come mistero. Vedi
 * l'analisi completa in
 * supabase/migrations/20260901020000_wishlist_items.sql.
 *
 * Le funzioni di scrittura (create/update/complete) operano invece sempre
 * sulla tabella base `wishlist_items` (la view è sola lettura).
 *
 * ATTENZIONE: `wishlist_items`/`wishlist_feed` esistono in
 * supabase/migrations/20260901020000_wishlist_items.sql ma non sono "live"
 * finché backend2 non conferma che main le ha applicate (`supabase db
 * push`) — vedi HANDOFF.md.
 */

import { createClient } from "@/lib/supabase/client";
import type { Database, WishlistCategory, WishlistPriority, WishlistTarget } from "@/types/database";

type WishlistItemUpdate = Database["public"]["Tables"]["wishlist_items"]["Update"];

/**
 * Item della wishlist così come va renderizzato in UI — nato dalla view
 * `wishlist_feed`. Per una sorpresa attiva non tua, title/description/price/
 * link/photoUrl sono `null` e `isHiddenSurprise` è `true`: NON trattare quel
 * `null` come "campo non compilato dall'utente", è un mascheramento
 * intenzionale lato server.
 */
export interface WishlistFeedItem {
  id: string;
  coupleId: string;
  createdBy: string;
  category: WishlistCategory;
  target: WishlistTarget;
  priority: WishlistPriority;
  isSurprise: boolean;
  status: "attivo" | "completato";
  isHiddenSurprise: boolean;
  title: string | null;
  description: string | null;
  price: number | null;
  link: string | null;
  photoUrl: string | null;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionError {
  error: string;
}

const FEED_SELECT_COLUMNS =
  "id, couple_id, created_by, category, target, priority, is_surprise, status, is_hidden_surprise, title, description, price, link, photo_url, completed_at, completed_by, created_at, updated_at";

function mapFeedRow(row: {
  id: string;
  couple_id: string;
  created_by: string;
  category: WishlistCategory;
  target: WishlistTarget;
  priority: WishlistPriority;
  is_surprise: boolean;
  status: "attivo" | "completato";
  is_hidden_surprise: boolean;
  title: string | null;
  description: string | null;
  price: number | null;
  link: string | null;
  photo_url: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}): WishlistFeedItem {
  return {
    id: row.id,
    coupleId: row.couple_id,
    createdBy: row.created_by,
    category: row.category,
    target: row.target,
    priority: row.priority,
    isSurprise: row.is_surprise,
    status: row.status,
    isHiddenSurprise: row.is_hidden_surprise,
    title: row.title,
    description: row.description,
    price: row.price,
    link: row.link,
    photoUrl: row.photo_url,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lista wishlist della coppia corrente, per la UI condivisa (legge la view
 * mascherata `wishlist_feed`, vedi commento in testa al file).
 */
export async function listWishlistFeed(): Promise<WishlistFeedItem[] | ActionError> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("wishlist_feed")
    .select(FEED_SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return (data ?? []).map(mapFeedRow);
}

export interface CreateWishlistItemInput {
  category: WishlistCategory;
  target: WishlistTarget;
  title: string;
  description?: string;
  price?: number;
  link?: string;
  photoUrl?: string;
  priority?: WishlistPriority;
  /** Richiede target 'partner' o 'entrambi' (vincolo DB), vedi commento in testa al file. */
  isSurprise?: boolean;
}

/**
 * Crea un nuovo wishlist item. Ritorna la riga appena creata letta dalla
 * TABELLA BASE (non dalla view): il creatore vede sempre tutto ciò che
 * inserisce, non serve/non ha senso mascherarlo a se stesso.
 */
export async function createWishlistItem(
  input: CreateWishlistItemInput,
): Promise<WishlistFeedItem | ActionError> {
  const title = input.title.trim();
  if (!title) return { error: "Il titolo non può essere vuoto." };
  if (input.isSurprise && input.target === "self") {
    return { error: "Un item 'solo per me' non può essere a sorpresa." };
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.couple_id) return { error: "Non sei accoppiato/a con un partner." };

  const { data, error } = await supabase
    .from("wishlist_items")
    .insert({
      couple_id: profile.couple_id,
      created_by: user.id,
      category: input.category,
      target: input.target,
      title,
      description: input.description ?? null,
      price: input.price ?? null,
      link: input.link ?? null,
      photo_url: input.photoUrl ?? null,
      priority: input.priority ?? "media",
      is_surprise: input.isSurprise ?? false,
    })
    .select(
      "id, couple_id, created_by, category, target, priority, is_surprise, status, title, description, price, link, photo_url, completed_at, completed_by, created_at, updated_at",
    )
    .single();

  if (error) return { error: error.message };

  // Il creatore non ha mai bisogno del mascheramento sulla propria riga.
  return mapFeedRow({ ...data, is_hidden_surprise: false });
}

export interface UpdateWishlistItemInput {
  category?: WishlistCategory;
  target?: WishlistTarget;
  title?: string;
  description?: string | null;
  price?: number | null;
  link?: string | null;
  photoUrl?: string | null;
  priority?: WishlistPriority;
  isSurprise?: boolean;
}

/**
 * Modifica un item esistente (campi descrittivi). Consentito al creatore
 * sempre; al partner solo se l'item non è (più) una sorpresa attiva — vedi
 * RLS `wishlist_items_update_own_or_not_hidden`.
 */
export async function updateWishlistItem(
  id: string,
  input: UpdateWishlistItemInput,
): Promise<WishlistFeedItem | ActionError> {
  const supabase = createClient();
  const patch: WishlistItemUpdate = {};
  if (input.category !== undefined) patch.category = input.category;
  if (input.target !== undefined) patch.target = input.target;
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.price !== undefined) patch.price = input.price;
  if (input.link !== undefined) patch.link = input.link;
  if (input.photoUrl !== undefined) patch.photo_url = input.photoUrl;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.isSurprise !== undefined) patch.is_surprise = input.isSurprise;

  const { data, error } = await supabase
    .from("wishlist_items")
    .update(patch)
    .eq("id", id)
    .select(
      "id, couple_id, created_by, category, target, priority, is_surprise, status, title, description, price, link, photo_url, completed_at, completed_by, created_at, updated_at",
    )
    .single();

  if (error) return { error: error.message };
  return mapFeedRow({ ...data, is_hidden_surprise: false });
}

/**
 * Segna un item come completato → sposta nell'archivio "Completati" (MAI
 * delete secco, vedi docs/PLAN.md). Da questo momento è visibile a
 * entrambi i partner anche se era una sorpresa (è così che l'archivio
 * rivela le sorprese passate).
 */
export async function completeWishlistItem(id: string): Promise<WishlistFeedItem | ActionError> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { data, error } = await supabase
    .from("wishlist_items")
    .update({
      status: "completato",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq("id", id)
    .select(
      "id, couple_id, created_by, category, target, priority, is_surprise, status, title, description, price, link, photo_url, completed_at, completed_by, created_at, updated_at",
    )
    .single();

  if (error) return { error: error.message };
  return mapFeedRow({ ...data, is_hidden_surprise: false });
}

/** Riporta un item completato per errore ad 'attivo' (annulla completeWishlistItem). */
export async function reopenWishlistItem(id: string): Promise<WishlistFeedItem | ActionError> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .update({ status: "attivo", completed_at: null, completed_by: null })
    .eq("id", id)
    .select(
      "id, couple_id, created_by, category, target, priority, is_surprise, status, title, description, price, link, photo_url, completed_at, completed_by, created_at, updated_at",
    )
    .single();

  if (error) return { error: error.message };
  return mapFeedRow({ ...data, is_hidden_surprise: false });
}

// Nessuna funzione deleteWishlistItem: per design non esiste una policy/
// grant DELETE su wishlist_items (vedi migration) — "MAI delete secco" è
// imposto anche qui lato client, non solo lato DB, per non offrire in UI
// un'azione che fallirebbe sempre.
