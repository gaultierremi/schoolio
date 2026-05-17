"use client";

import * as RadixLabel from "@radix-ui/react-label";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Label a11y-aware (Sprint 2B) — wrapper Radix `react-label`.
 *
 * Pourquoi Radix vs `<label>` natif :
 * - Garantit que cliquer sur le label focus l'input associé (htmlFor)
 * - Empêche la sélection de texte par double-clic (UX cleaner)
 * - 2kb gzip, headless (style 100 % Tailwind)
 *
 * Usage canonique :
 *   <Label htmlFor="my-input">Email</Label>
 *   <input id="my-input" type="email" />
 *
 * Pour les groupes de champs (radio, checkbox), utiliser `<fieldset><legend>`
 * plutôt qu'un Label seul.
 */
export type LabelProps = ComponentPropsWithoutRef<typeof RadixLabel.Root>;

export function Label({ className = "", ...props }: LabelProps) {
  return (
    <RadixLabel.Root
      className={`text-sm font-medium leading-none text-slate-700 dark:text-slate-300 ${className}`}
      {...props}
    />
  );
}

export default Label;
