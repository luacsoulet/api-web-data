import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "./ThemeToggle";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Immo Orléans",
  description: "Prix médians des communes du Loiret autour d'Orléans (DVF 2021-2025).",
};

// Appliqué avant le premier rendu : pas de flash clair quand le visiteur a choisi le sombre
const themeInitial = `try{if(localStorage.getItem("theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitial }} />
      </head>
      <body>
        <header className="entete">
          <nav aria-label="Principale">
            <Link href="/">Carte</Link>
            <Link href="/autour">Autour d&apos;une adresse</Link>
            <Link href="/estimer">Estimer un prix</Link>
          </nav>
          <ThemeToggle />
        </header>
        {children}
      </body>
    </html>
  );
}
