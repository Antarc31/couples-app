"use client";

/**
 * Azioni per il centro notifiche (campanella in `components/AppTopBar.tsx`,
 * vedi piano approvato in
 * `/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md`).
 *
 * Stesso pattern di lib/messages-actions.ts / lib/wishlist-actions.ts:
 * client browser Supabase, chiamato da componenti client-side.
 *
 * Le righe si creano SOLO lato server (trigger/RPC SECURITY DEFINER, vedi
 * supabase/migrations/20260901090000_notifications.sql) — questo modulo non
 * espone nessuna funzione di creazione. L'unica scrittura possibile dal
 * client è "segna come letta", via le RPC dedicate (nessun UPDATE diretto,
 * stesso trattamento di messages.liked_by).
 */

import { createClient } from "@/lib/supabase/client";
import type { NotificationType } from "@/types/database";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  sourceTable: string | null;
  sourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ActionError {
  error: string;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  source_table: string | null;
  source_id: string | null;
  read_at: string | null;
  created_at: string;
}

function mapRowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Ultime notifiche del destinatario corrente, più recenti prima. RLS scopa già a recipient_id = auth.uid(). */
export async function listNotifications(limit = 30): Promise<AppNotification[] | ActionError> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, source_table, source_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { error: error.message };
  return (data ?? []).map(mapRowToNotification);
}

/** Conteggio non lette per il badge — query leggera (head: true), non scarica le righe. */
export async function getUnreadNotificationsCount(): Promise<number | ActionError> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) return { error: error.message };
  return count ?? 0;
}

/** RPC mark_notification_read: segna una notifica come letta (no-op se già letta o non tua). */
export async function markNotificationRead(id: string): Promise<true | ActionError> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_notification_read", { notification_id: id });
  if (error) return { error: error.message };
  return true;
}

/** RPC mark_all_notifications_read: segna come lette tutte le notifiche non lette del chiamante. */
export async function markAllNotificationsRead(): Promise<true | ActionError> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { error: error.message };
  return true;
}
