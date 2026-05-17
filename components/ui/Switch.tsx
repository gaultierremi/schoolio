"use client";

import * as RadixSwitch from "@radix-ui/react-switch";
import type { Ref } from "react";

/**
 * Switch a11y-aware (Sprint 2B) — wrapper Radix `react-switch`.
 *
 * Pourquoi Radix vs hand-roll :
 * - `role="switch"` et `aria-checked` gérés automatiquement
 * - Navigation clavier (Space/Enter toggle, Tab focus) built-in
 * - Compatible screen readers (NVDA, VoiceOver) testé chez Radix
 * - Tree-shakeable, ~3kb gzip pour le Switch seul
 *
 * Usage :
 *   <Switch
 *     checked={isActive}
 *     onCheckedChange={(v) => setIsActive(v)}
 *     label="Activer la question"     // requis pour screen reader
 *     disabled={saving}
 *   />
 *
 * Stylage Tailwind aligné design-system MASTER :
 * - indigo-600 actif (primary)
 * - slate-300/700 inactif (suit dark mode)
 * - focus-visible ring 2px indigo (WCAG 2.4.7)
 * - transition 200ms ease (respecte motion-reduce)
 * - taille 44×24 (touch target 44px hauteur sur le hit area parent)
 */
export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Label parlant pour screen reader. Requis. */
  label: string;
  /** Optionnel : ID pour `aria-labelledby` si on a un label visible séparé. */
  labelledBy?: string;
  disabled?: boolean;
  /** Référence DOM forwardée si besoin (focus management externe). */
  ref?: Ref<HTMLButtonElement>;
  /** ID HTML optionnel pour ciblage <label htmlFor>. */
  id?: string;
};

export function Switch({
  checked,
  onCheckedChange,
  label,
  labelledBy,
  disabled = false,
  ref,
  id,
}: SwitchProps) {
  return (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      // Si labelledBy fourni, on l'utilise pour le screen reader (préfère ARIA visible) ;
      // sinon on tombe sur aria-label texte.
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      ref={ref}
      className="
        group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center
        rounded-full border border-transparent
        bg-slate-300 transition-colors duration-200 ease-out
        focus:outline-none
        focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
        focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900
        data-[state=checked]:bg-indigo-600
        dark:bg-slate-700 dark:data-[state=checked]:bg-indigo-500
        disabled:cursor-not-allowed disabled:opacity-50
        motion-reduce:transition-none
      "
    >
      <RadixSwitch.Thumb
        className="
          pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md
          ring-0 transition-transform duration-200 ease-out
          translate-x-0.5
          data-[state=checked]:translate-x-[1.375rem]
          motion-reduce:transition-none
        "
      />
    </RadixSwitch.Root>
  );
}

export default Switch;
