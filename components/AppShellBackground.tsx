"use client";

import { usePathname } from "next/navigation";
import { PAGE_THEME } from "@/lib/page-theme";

const HOME_BACKGROUND_THEME = "theme-home";

/**
 * Sfondo del guscio condiviso (app/(app)/layout.tsx: AppTopBar +
 * contenuto scrollabile + AppTabBar). Prima questi due div erano
 * trasparenti (o, in un giro precedente, bg-surface bianco fisso): in
 * qualunque area non coperta esattamente dal proprio div .theme-X di
 * ogni singola pagina (es. contenuto più corto della viewport, o durante
 * l'overscroll/"tirone" su iOS che rivela lo sfondo di <body>) si vedeva
 * o il vecchio rosa di --color-base a :root (mai aggiornato dal sistema a
 * tema) o, dopo il fix bg-surface, un bianco fisso che spegneva il colore
 * proprio di Calendario/Appuntamenti/Wishlist/Profilo. Questo componente
 * client legge il pathname (server layout non può, niente hook lì) e
 * applica la STESSA .theme-X della pagina anche al guscio: qualunque area
 * scoperta mostra il colore giusto invece di rosa o bianco fissi. Home fa
 * eccezione (.theme-home, bianco) — non ha un tema unico, mostra tutti i
 * widget colorati insieme.
 */
export default function AppShellBackground({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const theme =
    pathname === "/home"
      ? HOME_BACKGROUND_THEME
      : pathname === "/home/foto"
        ? "theme-memories" // stessa pagina/widget Ricordi, vedi PAGE_THEME per la logica generale
        : (PAGE_THEME[pathname] ?? "");

  return <div className={`${theme} bg-diary flex flex-1 flex-col`}>{children}</div>;
}
