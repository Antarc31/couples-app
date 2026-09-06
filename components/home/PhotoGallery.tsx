"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listPhotoMemories, type Thought } from "@/lib/messages-actions";
import { ImageIcon, X } from "@/components/ui/icons";

const PAGE_SIZE = 24;
/** Content di default salvato per le foto senza didascalia (vedi sendPhotoThought in lib/messages-actions.ts). */
const DEFAULT_PHOTO_CONTENT = "📷";

function formatFullTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Galleria foto persistente di Home (`app/(app)/home/foto/page.tsx`, vedi
 * piano approvato — Feature A). A differenza del mazzetto swipeabile
 * `MemoriesDeck` (solo le ultime N, non sfogliabile per intero), questa è
 * una grid con scroll verticale che carica TUTTE le foto della coppia,
 * a pagine via `listPhotoMemories`.
 *
 * Infinite-load: un sentinel invisibile in fondo alla grid viene osservato
 * con IntersectionObserver — quando entra nel viewport si carica la pagina
 * successiva (cursore = `created_at` dell'ultima foto già mostrata).
 * Tap su una foto apre un overlay fullscreen (stesso pattern modal di
 * EventDetailSheet/i menu di MemoriesDeck: fixed inset-0, bg-scrim/30,
 * backdrop-blur, click fuori per chiudere).
 */
export default function PhotoGallery({ selfId }: { selfId: string }) {
  const [photos, setPhotos] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<Thought | null>(null);

  // Rispecchiano gli state omonimi ma leggibili in modo sincrono dentro il
  // callback dell'IntersectionObserver (che altrimenti chiuderebbe su
  // valori stale del primo render in cui è stato creato l'observer).
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const result = await listPhotoMemories(nextCursorRef.current ?? undefined, PAGE_SIZE);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPhotos((prev) => [...prev, ...result.items]);
    nextCursorRef.current = result.nextCursor;
    hasMoreRef.current = result.nextCursor !== null;
    setNextCursor(result.nextCursor);
    setHasMore(result.nextCursor !== null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listPhotoMemories(undefined, PAGE_SIZE);
      if (cancelled) return;
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPhotos(result.items);
      nextCursorRef.current = result.nextCursor;
      hasMoreRef.current = result.nextCursor !== null;
      setNextCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMore è stabile (useCallback, deps []); ri-osserva solo quando loading/hasMore cambiano davvero
  }, [loading, hasMore]);

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-ink-soft">Carico le foto…</div>
      ) : photos.length === 0 && !error ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-[28px] bg-partner-a-soft/30 text-center text-sm text-ink-soft">
          <ImageIcon size={30} strokeWidth={1.8} />
          Nessuna foto ancora, mandane una dalla Home!
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                data-testid="gallery-photo"
                onClick={() => setSelected(photo)}
                aria-label={`Apri foto di ${photo.senderId === selfId ? "Tu" : photo.senderName}`}
                className="aspect-square overflow-hidden rounded-xl bg-scrim transition active:scale-[0.97]"
              >
                {photo.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL temporanea, non ottimizzabile da next/image
                  <img src={photo.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/60">
                    <ImageIcon size={20} strokeWidth={1.8} />
                  </div>
                )}
              </button>
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} className="flex h-10 items-center justify-center text-xs text-ink-soft">
              {loadingMore ? "Carico altre foto…" : ""}
            </div>
          )}
        </>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-scrim/85 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <button
            onClick={() => setSelected(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center text-white"
            aria-label="Chiudi"
          >
            <X size={22} strokeWidth={2.2} />
          </button>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col items-center gap-3 px-4" onClick={(e) => e.stopPropagation()}>
            {selected.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL temporanea, non ottimizzabile da next/image
              <img src={selected.photoUrl} alt="" className="max-h-[70vh] w-full rounded-2xl object-contain" />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-2xl bg-surface text-ink-soft">
                <ImageIcon size={36} strokeWidth={1.8} />
              </div>
            )}
            <div className="w-full text-center text-white">
              {selected.content !== DEFAULT_PHOTO_CONTENT && (
                <p className="text-base font-medium">{selected.content}</p>
              )}
              <p className="mt-1 text-xs text-white/70">
                {selected.senderId === selfId ? "Tu" : selected.senderName} · {formatFullTimestamp(selected.createdAt)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
