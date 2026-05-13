import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import BetaFeedbackButton from "@/components/beta/BetaFeedbackButton";
import "./globals.css";
import "katex/dist/katex.min.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Maïa — Apprentissage augmenté",
  description: "Plateforme de renforcement adaptive pour le secondaire FW-B. Le prof reste l'autorité pédagogique.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const messages = await getMessages();
  return (
    <html lang="fr">
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <BetaFeedbackButton />
      </body>
    </html>
  );
}
