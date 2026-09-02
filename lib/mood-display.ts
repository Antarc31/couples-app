import type { MoodType } from "@/types/database";

/** Emoji/etichette per i 6 stati d'animo — condivise da MoodCheckIn e MoodRevealSheet, non duplicate. */
export const MOOD_EMOJI: Record<MoodType, string> = {
  felice: "😊",
  sereno: "😌",
  stanco: "😴",
  stressato: "😣",
  triste: "😢",
  innamorato: "🥰",
};

export const MOOD_LABEL: Record<MoodType, string> = {
  felice: "Felice",
  sereno: "Sereno/a",
  stanco: "Stanco/a",
  stressato: "Stressato/a",
  triste: "Triste",
  innamorato: "Innamorato/a",
};

export const MOOD_VALUES = Object.keys(MOOD_EMOJI) as MoodType[];
