/**
 * // Indicateur inline dans le cockpit prof :
 * // <ListeningIndicator />
 *
 * // Indicateur fixe sur l'ecran eleve :
 * // <ListeningIndicator position="top-right" label="Ecoute active" size="lg" />
 */
export type ListeningIndicatorProps = {
  position?: "top-right" | "bottom-right" | "top-left" | "bottom-left" | "inline";
  label?: string;
  size?: "sm" | "md" | "lg";
};

type ListeningIndicatorPosition = NonNullable<ListeningIndicatorProps["position"]>;
type ListeningIndicatorSize = NonNullable<ListeningIndicatorProps["size"]>;

const positionClasses: Record<ListeningIndicatorPosition, string> = {
  inline: "inline-flex text-red-400",
  "top-right": "fixed right-4 top-4 z-50 bg-gray-900/80 text-white backdrop-blur",
  "bottom-right": "fixed bottom-4 right-4 z-50 bg-gray-900/80 text-white backdrop-blur",
  "top-left": "fixed left-4 top-4 z-50 bg-gray-900/80 text-white backdrop-blur",
  "bottom-left": "fixed bottom-4 left-4 z-50 bg-gray-900/80 text-white backdrop-blur",
};

const fixedChromeClasses: Record<ListeningIndicatorPosition, string> = {
  inline: "",
  "top-right": "rounded-full border border-red-500/20 px-3 py-1.5 shadow-lg shadow-black/20",
  "bottom-right": "rounded-full border border-red-500/20 px-3 py-1.5 shadow-lg shadow-black/20",
  "top-left": "rounded-full border border-red-500/20 px-3 py-1.5 shadow-lg shadow-black/20",
  "bottom-left": "rounded-full border border-red-500/20 px-3 py-1.5 shadow-lg shadow-black/20",
};

const sizeClasses: Record<
  ListeningIndicatorSize,
  {
    dot: string;
    ring: string;
    label: string;
    gap: string;
  }
> = {
  sm: {
    dot: "h-2 w-2",
    ring: "h-2 w-2",
    label: "text-xs",
    gap: "gap-2",
  },
  md: {
    dot: "h-2.5 w-2.5",
    ring: "h-2.5 w-2.5",
    label: "text-sm",
    gap: "gap-2",
  },
  lg: {
    dot: "h-3 w-3",
    ring: "h-3 w-3",
    label: "text-base",
    gap: "gap-2.5",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ListeningIndicator({
  position = "inline",
  label = "Schoolio écoute",
  size = "md",
}: ListeningIndicatorProps) {
  const sizeConfig = sizeClasses[size];

  return (
    <div
      className={cx(
        "items-center",
        sizeConfig.gap,
        positionClasses[position],
        fixedChromeClasses[position],
      )}
      role="status"
      aria-label={label}
    >
      <style jsx>{`
        @keyframes listening-ring {
          from {
            opacity: 0.6;
            transform: scale(1);
          }

          to {
            opacity: 0;
            transform: scale(1.8);
          }
        }
      `}</style>

      <span className={cx("relative inline-flex shrink-0 items-center justify-center", sizeConfig.dot)} aria-hidden="true">
        <span
          className={cx("absolute rounded-full bg-red-500", sizeConfig.ring)}
          style={{ animation: "listening-ring 1.5s ease-out infinite" }}
        />
        <span className={cx("relative rounded-full bg-red-500", sizeConfig.dot)} />
      </span>
      <span className={cx("font-medium leading-none", sizeConfig.label)}>{label}</span>
    </div>
  );
}

export default ListeningIndicator;
