import Link from "next/link";
import Card from "@/components/ui/Card";
import { Gift } from "@/components/ui/icons";
import type { WishlistCategory } from "@/types/database";

function formatPrice(price: number | null): string | null {
  if (price == null) return null;
  return Number.isInteger(price) ? `~${price}€` : `~${price.toFixed(2)}€`;
}

export interface WishlistPreviewItem {
  id: string;
  created_by: string;
  category: WishlistCategory;
  is_hidden_surprise: boolean;
  title: string | null;
  price: number | null;
  is_surprise: boolean;
}

interface WishlistPreviewCardProps {
  items: WishlistPreviewItem[];
  selfId: string;
  partnerName: string;
}

/**
 * Anteprima wishlist in Home — legge la view `wishlist_feed` (già mascherata
 * lato server per le sorprese attive del partner), stessa fonte dati e
 * stessa logica di visualizzazione di WishlistView.tsx.
 */
export default function WishlistPreviewCard({ items, selfId, partnerName }: WishlistPreviewCardProps) {
  return (
    <Card gradient="coral" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Wishlist</h2>
        <Link href="/wishlist" className="text-xs font-semibold text-white/85 underline underline-offset-2">
          Vedi tutta
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-white/15 px-3 py-3 text-center text-xs text-white/85">
          Ancora nulla in wishlist. Aggiungine una!
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/15 px-3 py-2">
              <Gift size={18} strokeWidth={2.2} className="shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{item.is_hidden_surprise ? "Sorpresa in arrivo…" : item.title}</p>
                <p className="text-xs text-white/75">
                  aggiunto da {item.created_by === selfId ? "te" : partnerName}
                  {!item.is_hidden_surprise && formatPrice(item.price) ? ` · ${formatPrice(item.price)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
