import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCoupleData } from "@/lib/current-couple";
import PhotoGallery from "@/components/home/PhotoGallery";

/**
 * Galleria foto persistente (piano approvato — Feature A). Route annidata
 * sotto /home (NON una sesta tab: AppTabBar ha un union type stretto a 5
 * route e la sua logica attiva già "Home" qui via `pathname.startsWith`,
 * vedi components/AppTabBar.tsx). Stesso guard pattern di home/page.tsx —
 * il layout app/(app)/layout.tsx ha già verificato login+pairing, qui si
 * ricontrolla solo per degradare in modo esplicito se getCurrentCoupleData
 * ritorna null.
 */
export default async function PhotoGalleryPage() {
  const data = await getCurrentCoupleData();
  if (!data || !data.couple) redirect("/pairing");

  return (
    <div className="theme-memories bg-diary flex flex-1 flex-col gap-4 px-4 pt-5 pb-24">
      <div className="flex items-center gap-3">
        <Link
          href="/home"
          aria-label="Torna alla Home"
          className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-ink-soft transition active:scale-95"
        >
          ←
        </Link>
        <h1 className="text-[22px] font-bold leading-tight text-ink">Tutte le foto</h1>
      </div>
      <PhotoGallery selfId={data.userId} />
    </div>
  );
}
