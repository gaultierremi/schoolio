import { UserCircle } from "lucide-react";

/**
 * Avatar Maïa — simplifié au strict nécessaire (Sprint 0 Phase F2).
 *
 * Photo exportée du SSO (Google / Microsoft / SmartSchool quand dispo) si
 * disponible, sinon icône Lucide UserCircle en fallback.
 *
 * Conforme à design-system/MASTER.md §Iconographie + mémoire
 * `feedback_no_pricing_public` : pas de skins gamification (laurel/helmet/
 * samurai), pas de level badges (Bronze/Silver/Gold/Diamond). Le système
 * de gamification avancée est HORS scope MVP (spec §2.2).
 */
type AvatarProps = {
  /** Photo SSO de l'utilisateur (Google avatar_url, M365 photo URL, etc.). */
  photoUrl?: string | null;
  /** Nom affiché pour l'alt + aria-label. Défaut "Utilisateur". */
  name?: string | null;
  /** Taille en pixels. Défaut 32 (cohérent avec Header). */
  size?: number;
  /** Classes Tailwind additionnelles. */
  className?: string;
};

export default function Avatar({
  photoUrl,
  name,
  size = 32,
  className = "",
}: AvatarProps) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name ?? "Utilisateur"}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <UserCircle
      width={size}
      height={size}
      className={`text-slate-400 ${className}`}
      strokeWidth={1.5}
      aria-label={name ?? "Utilisateur"}
    />
  );
}
