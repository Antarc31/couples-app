"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  listNotifications,
  getUnreadNotificationsCount,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "@/lib/notifications-actions";
import type { Database, NotificationType } from "@/types/database";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

const TYPE_ICON: Record<NotificationType, string> = {
  reazione: "❤️",
  evento_coppia: "📅",
  appuntamento: "🗓️",
  wishlist: "🎁",
};

/** Dove porta il tap su una notifica, per tipo — vedi handleRowTap. */
const TYPE_DESTINATION: Record<NotificationType, string> = {
  reazione: "/home",
  evento_coppia: "/calendario",
  appuntamento: "/appuntamenti",
  wishlist: "/wishlist",
};

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

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h fa`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} g fa`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

/**
 * Top bar persistente in tutte le schermate autenticate (montata da
 * app/(app)/layout.tsx), con la campanella notifiche. Prima vera
 * sottoscrizione Realtime del progetto (blueprint già documentato in
 * supabase/README.md, "Realtime — pattern di subscription per il
 * frontend").
 */
export default function AppTopBar({ userId }: { userId: string }) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getUnreadNotificationsCount();
      if (!cancelled && typeof result === "number") setUnreadCount(result);
    })();

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = mapRowToNotification(payload.new as NotificationRow);
          setUnreadCount((c) => c + 1);
          setNotifications((prev) => [incoming, ...prev]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function openPanel() {
    setPanelOpen(true);
    setLoadingPanel(true);
    setError(null);
    const result = await listNotifications();
    setLoadingPanel(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setNotifications(result);
  }

  async function handleRowTap(n: AppNotification) {
    if (!n.readAt) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      await markNotificationRead(n.id);
    }
    setPanelOpen(false);
    router.push(TYPE_DESTINATION[n.type]);
  }

  async function handleMarkAll() {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: now })));
    setUnreadCount(0);
    await markAllNotificationsRead();
  }

  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <>
      {/* Niente backdrop-blur qui: su Safari un filtro/backdrop-filter su un
          antenato cambia il containing block degli elementi position:fixed
          discendenti — il click-catcher a tutto schermo del pannello sotto
          finiva confinato al solo riquadro della barra invece di coprire lo
          schermo, lasciando il contenuto della pagina visibile e non
          oscurato dietro al pannello. bg-base/95 (colore semi-trasparente,
          non un filtro) resta invece innocuo. */}
      <div
        className="sticky top-0 z-30 flex w-full items-center justify-end border-b border-border bg-base/95 px-4 py-2"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => (panelOpen ? setPanelOpen(false) : openPanel())}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink shadow-sm transition active:scale-95"
            aria-label={unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : "Notifiche"}
          >
            🔔
          </button>
          {unreadCount > 0 && (
            <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-couple px-1 text-[10px] font-bold text-white ring-2 ring-base">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      </div>

      {panelOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-start sm:justify-end sm:p-4"
          style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
          onClick={() => setPanelOpen(false)}
        >
          <div
            className="flex max-h-[75vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-[var(--shadow-soft)] sm:mt-12 sm:max-h-[70vh] sm:w-80 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" />
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-ink">Notifiche</h2>
              {hasUnread && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="text-xs font-semibold text-couple transition active:scale-95"
                >
                  Segna tutte come lette
                </button>
              )}
            </div>

            <div className="overflow-y-auto">
              {loadingPanel ? (
                <p className="px-4 py-6 text-center text-xs text-ink-soft">Carico le notifiche…</p>
              ) : error ? (
                <p className="px-4 py-6 text-center text-xs text-danger">{error}</p>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-ink-soft">Nessuna notifica per ora</p>
              ) : (
                <ul className="flex flex-col">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleRowTap(n)}
                        className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition last:border-b-0 active:scale-[0.99] ${
                          n.readAt ? "" : "bg-couple-soft/40"
                        }`}
                      >
                        <span className="text-lg leading-none">{TYPE_ICON[n.type]}</span>
                        <span className="flex-1">
                          <span className="block text-sm font-semibold text-ink">{n.title}</span>
                          {n.body && <span className="mt-0.5 block text-xs text-ink-soft">{n.body}</span>}
                          <span className="mt-1 block text-[11px] text-ink-soft">
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
