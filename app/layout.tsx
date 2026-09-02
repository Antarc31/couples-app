import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
  themeColor: "#FFF8F6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-base text-ink font-sans">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
