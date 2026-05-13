import type { Metadata } from "next";
import { Inter } from "next/font/google";
import BetaFeedbackButton from "@/components/beta/BetaFeedbackButton";
import "./globals.css";
import "katex/dist/katex.min.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Maïa — Apprentissage augmenté",
  description: "Plateforme de renforcement adaptive pour le secondaire FW-B. Le prof reste l'autorité pédagogique.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <BetaFeedbackButton />
      </body>
    </html>
  );
}
