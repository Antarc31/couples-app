"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { getThrowbackForToday, type Thought } from "@/lib/messages-actions";

const MAX_THOUGHTS = 3;

interface ThrowbackCardProps {
  selfId: string;
}

/**
 * "Un anno fa oggi" (Fase C del piano): pensieri/foto/regali della stessa
 * data esatta un anno prima, self-fetch client-side (stesso schema di
 * MemoriesDeck). Nessun output — né skeleton né messaggio d'errore — se non
 * c'è nulla da mostrare quel giorno: è un bonus silenzioso, mai una card
 * vuota che occupa spazio a caso (stesso "opt-out facile" di CountdownHeader).
 */
export default function ThrowbackCard({ selfId }: ThrowbackCardProps) {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [giftTitles, setGiftTitles] = useState<string[]>([]);
  const [selected, setSelected] = useState<Thought | null>(null);

  useEffect(() => {
    let cancelled = false;
    getThrowbackForToday().then((result) => {
      if (cancelled || "error" in result) return;
      setThoughts(result.thoughts.slice(0, MAX_THOUGHTS));
      setGiftTitles(result.giftTitles);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (thoughts.length === 0 && giftTitles.length === 0) return null;

  return (
    <>
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink">📼 Un anno fa oggi</h2>
        {thoughts.length > 0 && (
          <ul className="flex flex-col gap-2">
            {thoughts.map((thought) => (
              <li key={thought.id}>
                <button
                  type="button"
                  onClick={() => thought.type === "photo" && setSelected(thought)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-base px-3 py-2 text-left"
                >
                  {thought.type === "photo" ? (
                    thought.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL temporanea, non ottimizzabile da next/image
                      <img
                        src={thought.photoUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-lg">
                        📷
                      </div>
                    )
                  ) : (
                    <span className="text-xl">💭</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{thought.content}</p>
                    <p className="text-xs text-ink-soft">{thought.senderId === selfId ? "Tu" : thought.senderName}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {giftTitles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {giftTitles.map((title, i) => (
              <span key={i} className="rounded-full bg-special-soft px-3 py-1 text-xs font-semibold text-ink">
                🎁 {title}
              </span>
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/85 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <button
            onClick={() => setSelected(null)}
            className="absolute right-4 top-4 text-2xl text-white"
            aria-label="Chiudi"
          >
            ✕
          </button>
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col items-center gap-3 px-4"
            onClick={(e) => e.stopPropagation()}
          >
            {selected.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL temporanea, non ottimizzabile da next/image
              <img src={selected.photoUrl} alt="" className="max-h-[70vh] w-full rounded-2xl object-contain" />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-2xl bg-surface text-4xl">📷</div>
            )}
            <div className="w-full text-center text-white">
              <p className="text-base font-medium">{selected.content}</p>
              <p className="mt-1 text-xs text-white/70">
                {selected.senderId === selfId ? "Tu" : selected.senderName} · un anno fa
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
