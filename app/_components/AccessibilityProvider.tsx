"use client";

import { useEffect } from "react";

/**
 * Sprint 6 PR S6-8 — Applique les préférences accessibilité au DOM.
 *
 * Pose `data-dyslexic="true"` sur `<html>` si l'utilisateur a coché la
 * préférence. Le CSS global (`app/globals.css`) lit cet attribut pour
 * appliquer la font OpenDyslexic.
 *
 * Note : la pref est passée depuis le server component (RootLayout ou
 * page accueil) qui a déjà fetché user_profiles. Pas de fetch client ici
 * pour éviter le flash of unstyled content.
 */
export default function AccessibilityProvider({
  prefersDyslexicFont,
}: {
  prefersDyslexicFont: boolean;
}) {
  useEffect(() => {
    const html = document.documentElement;
    if (prefersDyslexicFont) {
      html.setAttribute("data-dyslexic", "true");
    } else {
      html.removeAttribute("data-dyslexic");
    }
    // Pas de cleanup explicit : si le user change de page, le provider
    // remount et set/unset à nouveau. Si pref active partout dans la session,
    // l'attribut reste posé en continu.
  }, [prefersDyslexicFont]);

  return null;
}
