"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Wrapper next-themes (Sprint 1.5).
 *
 * Configuration :
 * - attribute="class" : applique `.dark` sur <html> (matche le @variant dark dans globals.css)
 * - defaultTheme="system" : suit prefers-color-scheme par défaut
 * - enableSystem : permet le mode "system" (auto light/dark selon OS)
 * - disableTransitionOnChange : évite flash de transition au toggle (cleaner)
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
