/**
 * Mappa condivisa pathname -> classe .theme-X (vedi app/globals.css) per le
 * 4 schermate con un colore dedicato (Calendario/Appuntamenti condividono lo
 * stesso: sono lo stesso dato, un appuntamento confermato è un evento
 * calendario). Home è volutamente ASSENTE da questa mappa: non ha un colore
 * unico (mostra tutti i widget colorati insieme), e i due consumer sotto la
 * trattano diversamente — AppTopBar la vuole .theme-neutral (grigio, il
 * titolo pagina non deve spiccare colorato), il guscio di sfondo la vuole
 * .theme-home (bianco) — quindi ciascuno applica il proprio fallback per
 * "/home" invece di un valore condiviso qui.
 */
export const PAGE_THEME: Record<string, string> = {
  "/calendario": "theme-calendar",
  "/appuntamenti": "theme-calendar",
  "/wishlist": "theme-wishlist",
  "/profilo": "theme-profile",
};
