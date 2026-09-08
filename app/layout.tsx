import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Caveat, Space_Grotesk } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

/**
 * Tre font, tre ruoli precisi (redesign "Diario di coppia"): Space
 * Grotesk sostituisce Nunito come font di base dell'app (corpo testo,
 * bottoni, tab bar, input); Instrument Serif italic è riservato al
 * numero enorme del countdown in Home; Caveat (a mano) copre titoli di
 * sezione e sticker. Mai mescolati con font generici altrove.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Couples App",
  description: "La vostra dashboard di coppia: calendario condiviso, appuntamenti, wishlist e pensieri per il partner.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Couples",
  },
  icons: {
    icon: "/icons/favicon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Colore di sistema per le zone che il contenuto web non copre (es. la
  // fascia dello home indicator su iOS, da PWA installata) — statico,
  // indipendente dalla pagina mostrata, quindi non può inseguire il tema
  // per-pagina introdotto nel sistema colori. Prima era il rosa della
  // vecchia palette monocromatica (#F8ECF1): non aggiornato durante il
  // giro colori, restava visibile come una striscia rosa fissa in fondo
  // a OGNI pagina anche dopo che tutto il resto era stato ricolorato.
  // Bianco/quasi bianco (stesso valore di --color-surface) per restare
  // neutro rispetto a tutti i temi.
  themeColor: "#fefdfb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${instrumentSerif.variable} ${caveat.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-base text-ink font-sans">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
