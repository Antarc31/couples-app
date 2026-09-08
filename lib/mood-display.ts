import type { MoodType } from "@/types/database";

/** Emoji/etichette per gli stati d'animo — condivise da MoodCheckIn e MoodRevealSheet, non duplicate. */
export const MOOD_EMOJI: Record<MoodType, string> = {
  felice: "😊",
  sereno: "😌",
  stanco: "😴",
  stressato: "😣",
  triste: "😢",
  innamorato: "🥰",
  arrabbiato: "😠",
  // Nessuna emoji fissa dedicata: "altro" è per definizione uno stato non
  // previsto dalle altre etichette. Il chip generico segnala "guarda
  // l'etichetta scritta", che è dove vive il vero significato.
  altro: "💭",
};

export const MOOD_LABEL: Record<MoodType, string> = {
  felice: "Felice",
  sereno: "Sereno/a",
  stanco: "Stanco/a",
  stressato: "Stressato/a",
  triste: "Triste",
  innamorato: "Innamorato/a",
  arrabbiato: "Arrabbiato/a",
  altro: "Altro",
};

/**
 * Tutti gli stati eccetto "altro" — è l'unico dei MOOD_VALUES che non va
 * proposto come bottone diretto (serve prima un'etichetta scritta a mano,
 * vedi MoodCheckIn.tsx). "altro" resta comunque un MoodType a pieno titolo
 * per tutto il resto (storico, rivelazione, DB).
 */
export const MOOD_VALUES = (Object.keys(MOOD_EMOJI) as MoodType[]).filter((m) => m !== "altro");
