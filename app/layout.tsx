import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import BetaFeedbackButton from "@/components/beta/BetaFeedbackButton";
import ThemeProvider from "@/components/ThemeProvider";
import SkipLink from "@/components/a11y/SkipLink";
import "./globals.css";
import "katex/dist/katex.min.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Maïa — Apprendre ce qu'on ne sait pas encore",
  description: "Plateforme d'apprentissage augmentée pour le secondaire. Chaque élève voit ses lacunes, le prof voit sa classe, Maïa s'occupe du reste. Aligné programme FW-B.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const messages = await getMessages();
  return (
    <html
      lang="fr-BE"
      className={`${inter.variable} ${sourceSerif.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Sprint 1.5 polish (a11y) — WCAG 2.4.1 Bypass Blocks. Premier
            élément focusable, sr-only puis visible au focus. */}
        <SkipLink />
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
          <BetaFeedbackButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
