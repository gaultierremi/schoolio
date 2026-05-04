import { getSkinById } from "@/lib/skins";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<AvatarSize, number> = {
  sm: 32,
  md: 48,
  lg: 80,
  xl: 180,
};

export function getLevelInfo(totalGames: number): {
  color: string;
  label: string;
  shortLabel: string;
} {
  if (totalGames >= 100)
    return { color: "#67e8f9", label: "💎 Diamant", shortLabel: "D" };
  if (totalGames >= 50)
    return { color: "#f59e0b", label: "🥇 Or", shortLabel: "O" };
  if (totalGames >= 10)
    return { color: "#94a3b8", label: "🥈 Argent", shortLabel: "A" };
  return { color: "#a16207", label: "🥉 Bronze", shortLabel: "B" };
}

type AvatarProfile = {
  avatar_color: string;
  active_skin: string | null;
  user_name: string;
  streak?: number;
};

function SkinAccessory({ skinId }: { skinId: string }) {
  switch (skinId) {
    case "roman_laurel":
      return (
        <>
          <path d="M28 33 C36 20 64 20 72 33" stroke="#65a30d" strokeWidth="4" strokeLinecap="round" />
          {[32, 38, 44, 56, 62, 68].map((cx, i) => (
            <ellipse
              key={cx}
              cx={cx}
              cy={i < 3 ? 29 - i : 27 + (i - 3)}
              rx="3"
              ry="6"
              fill="#84cc16"
              transform={`rotate(${i < 3 ? -35 : 35} ${cx} ${i < 3 ? 29 - i : 27 + (i - 3)})`}
            />
          ))}
          <circle cx="50" cy="25" r="2" fill="#facc15" />
        </>
      );

    case "greek_helmet":
      return (
        <>
          <path d="M30 37 C30 17 70 17 70 37 L66 54 C56 49 44 49 34 54Z" fill="#c084fc" />
          <path d="M47 16 C43 8 57 8 53 16 L56 35 H44Z" fill="#dc2626" />
          <path d="M36 36 H66" stroke="#fef3c7" strokeWidth="4" strokeLinecap="round" />
          <path d="M63 36 C69 40 68 49 63 54" stroke="#581c87" strokeWidth="4" strokeLinecap="round" />
        </>
      );

    case "musketeer_hat":
      return (
        <>
          <path d="M23 35 C34 23 65 23 77 35 C62 39 38 39 23 35Z" fill="#111827" />
          <path d="M35 28 C43 16 60 17 67 29" fill="#1f2937" />
          <path d="M66 22 C78 12 86 17 74 27" stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" />
          <path d="M30 35 C42 40 60 40 72 35" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
        </>
      );

    case "pharaoh_mask":
      return (
        <>
          <path d="M27 33 C28 13 72 13 73 33 L68 58 C59 50 41 50 32 58Z" fill="#facc15" />
          <path d="M33 25 H67" stroke="#1d4ed8" strokeWidth="4" />
          <path d="M30 34 H70" stroke="#1d4ed8" strokeWidth="3" />
          <path d="M36 18 L42 34 M64 18 L58 34" stroke="#1d4ed8" strokeWidth="3" />
          <circle cx="50" cy="26" r="4" fill="#38bdf8" />
        </>
      );

    case "resistance_beret":
      return (
        <>
          <path d="M28 31 C37 17 66 19 75 32 C62 29 42 29 28 31Z" fill="#27272a" />
          <path d="M30 31 C38 38 59 39 73 33" fill="#18181b" />
          <circle cx="64" cy="27" r="3" fill="#dc2626" />
        </>
      );

    case "plague_doctor":
      return (
        <>
          <path d="M28 32 C33 16 67 16 72 32 C62 27 38 27 28 32Z" fill="#111827" />
          <path d="M35 39 C42 33 57 33 65 39 L55 49 C52 53 48 53 45 49Z" fill="#f8fafc" />
          <path d="M54 43 C66 44 77 48 83 55 C68 54 58 51 51 47Z" fill="#e5e7eb" />
          <circle cx="42" cy="40" r="3" fill="#111827" />
          <circle cx="58" cy="40" r="3" fill="#111827" />
        </>
      );

    case "samurai_helmet":
      return (
        <>
          <path d="M28 35 C31 16 69 16 72 35 C61 31 39 31 28 35Z" fill="#7f1d1d" />
          <path d="M25 36 C38 43 62 43 75 36" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
          <path d="M38 23 L50 11 L62 23" stroke="#facc15" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M50 16 V35" stroke="#facc15" strokeWidth="2.5" />
          <path d="M34 34 H66" stroke="#fef3c7" strokeWidth="2.5" strokeLinecap="round" />
        </>
      );

    case "napoleon_hat":
      return (
        <>
          <path d="M24 30 C35 13 66 13 77 30 C66 25 35 25 24 30Z" fill="#111827" />
          <path d="M30 29 C39 20 61 20 70 29 C57 26 43 26 30 29Z" fill="#374151" />
          <path d="M47 19 L53 19 L51 27 L49 27Z" fill="#facc15" />
          <path d="M28 31 C40 36 61 36 73 31" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
        </>
      );

    case "scholar_hat":
      return (
        <>
          <path d="M20 29 L50 15 L80 29 L50 43Z" fill="#111827" />
          <path d="M31 32 L50 41 L69 32 L69 42 C60 50 40 50 31 42Z" fill="#1f2937" />
          <path d="M72 31 L72 48" stroke="#facc15" strokeWidth="2" />
          <circle cx="72" cy="51" r="3" fill="#facc15" />
        </>
      );

    case "knight_helmet":
      return (
        <>
          <path d="M27 34 C27 18 73 18 73 34 L69 52 C60 47 40 47 31 52Z" fill="#9ca3af" />
          <path d="M32 35 C42 31 58 31 68 35" stroke="#e5e7eb" strokeWidth="5" strokeLinecap="round" />
          <path d="M36 39 H64" stroke="#374151" strokeWidth="3" strokeLinecap="round" />
          <path d="M40 44 H60" stroke="#374151" strokeWidth="2" strokeLinecap="round" />
        </>
      );

    case "viking_helmet":
      return (
        <>
          <path d="M30 36 C32 18 68 18 70 36 C60 32 40 32 30 36Z" fill="#9ca3af" />
          <path d="M30 30 C16 21 14 13 20 9 C22 20 31 24 38 25" fill="#f8fafc" />
          <path d="M70 30 C84 21 86 13 80 9 C78 20 69 24 62 25" fill="#f8fafc" />
          <path d="M50 18 V36" stroke="#64748b" strokeWidth="3" />
          <path d="M36 34 C43 31 57 31 64 34" stroke="#e5e7eb" strokeWidth="3" strokeLinecap="round" />
        </>
      );

    case "egypt_crown":
      return (
        <>
          <path d="M32 35 L38 17 L47 32 L50 12 L53 32 L62 17 L68 35Z" fill="#facc15" />
          <path d="M32 35 H68 V41 H32Z" fill="#eab308" />
          <circle cx="50" cy="29" r="5" fill="#38bdf8" />
          <path d="M39 33 H45 M55 33 H61" stroke="#7c2d12" strokeWidth="2" strokeLinecap="round" />
        </>
      );

    case "louis_wig":
      return (
        <>
          <path d="M25 34 C26 15 74 15 75 34 C70 27 30 27 25 34Z" fill="#f8fafc" />
          {[30, 38, 46, 54, 62, 70].map((cx, i) => (
            <circle key={cx} cx={cx} cy={i < 3 ? 35 - i * 3 : 29 + (i - 3) * 3} r="7" fill="#e5e7eb" />
          ))}
          <circle cx="28" cy="45" r="8" fill="#e5e7eb" />
          <circle cx="72" cy="45" r="8" fill="#e5e7eb" />
        </>
      );

    default:
      return (
        <>
          <path d="M28 33 C34 20 66 20 72 33 C58 28 42 28 28 33Z" fill="#78350f" opacity="0.9" />
          <path d="M31 31 C39 25 61 25 69 31" stroke="#92400e" strokeWidth="5" strokeLinecap="round" />
        </>
      );
  }
}

export default function Avatar({
  profile,
  totalGames = 0,
  size = "md",
  showBadge = true,
  animated = false,
}: {
  profile: AvatarProfile;
  totalGames?: number;
  size?: AvatarSize;
  showBadge?: boolean;
  animated?: boolean;
}) {
  const px = SIZE_PX[size];
  const level = getLevelInfo(totalGames);
  const skin = getSkinById(profile.active_skin);

  const isLarge = size === "lg" || size === "xl";
  const streak = profile.streak ?? 0;
  const hasStreakAura = streak >= 3;

  const badgeSize = Math.round(px * 0.23);
  const badgeFontSize = Math.round(px * 0.09);

  return (
    <div
      title={profile.user_name}
      className={[
        "relative shrink-0 select-none",
        animated
          ? "transition-all duration-300 hover:-translate-y-1 hover:scale-105"
          : "",
      ].join(" ")}
      style={{
        width: px,
        height: px,
        animation: animated ? "avatar-breath 4s ease-in-out infinite" : undefined,
      }}
    >
      {hasStreakAura && (
        <div
          className="absolute inset-[-7%] rounded-full bg-gradient-to-br from-orange-300 via-amber-200 to-yellow-100 blur-md"
          style={{
            animation: "avatar-glow 2.5s ease-in-out infinite",
          }}
          aria-hidden
        />
      )}

      <svg
        width={px}
        height={px}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative drop-shadow-xl"
      >
        <defs>
          <radialGradient id={`bg-${px}`} cx="32%" cy="22%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#fff7ed" />
            <stop offset="100%" stopColor="#fed7aa" />
          </radialGradient>

          <radialGradient id={`skin-${px}`} cx="35%" cy="25%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="35%" stopColor={profile.avatar_color} />
            <stop offset="100%" stopColor={profile.avatar_color} stopOpacity="0.72" />
          </radialGradient>

          <linearGradient id={`shirt-${px}`} x1="25" y1="58" x2="75" y2="98">
            <stop offset="0%" stopColor={profile.avatar_color} />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.45" />
          </linearGradient>

          <linearGradient id={`ring-${px}`} x1="0" y1="0" x2="100" y2="100">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor={level.color} />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        <circle cx="50" cy="50" r="48" fill={`url(#bg-${px})`} />
        <circle cx="50" cy="50" r="47" stroke={`url(#ring-${px})`} strokeWidth="3" />

        <path
          d="M18 93 C21 72 34 63 50 63 C66 63 79 72 82 93Z"
          fill={`url(#shirt-${px})`}
        />

        <path
          d="M27 92 C32 76 40 70 50 70 C60 70 68 76 73 92"
          fill="#ffffff"
          opacity="0.18"
        />

        <circle cx="50" cy="42" r="24" fill={`url(#skin-${px})`} />

        <path
          d="M31 40 C33 32 39 26 49 25 C61 24 68 31 70 41 C65 34 56 32 49 33 C40 33 35 36 31 40Z"
          fill="#78350f"
          opacity="0.42"
        />

        <g>
          <SkinAccessory skinId={skin.id} />
        </g>

        <ellipse cx="41" cy="43" rx="2.4" ry="3.2" fill="#0f172a" opacity="0.8" />
        <ellipse cx="59" cy="43" rx="2.4" ry="3.2" fill="#0f172a" opacity="0.8" />

        <circle cx="42" cy="42" r="0.8" fill="white" opacity="0.9" />
        <circle cx="60" cy="42" r="0.8" fill="white" opacity="0.9" />

        <path
          d="M42 54 C46 58 54 58 58 54"
          stroke="#0f172a"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.62"
        />

        <ellipse cx="38" cy="50" rx="5" ry="2.8" fill="#fb7185" opacity="0.2" />
        <ellipse cx="62" cy="50" rx="5" ry="2.8" fill="#fb7185" opacity="0.2" />

        <path
          d="M34 36 C39 29 49 27 59 30"
          stroke="#ffffff"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.22"
        />
      </svg>

      {showBadge && isLarge && (
        <div
          className="absolute bottom-1 right-1 flex items-center justify-center rounded-full border-2 border-white font-black text-white shadow-lg"
          style={{
            width: badgeSize,
            height: badgeSize,
            backgroundColor: level.color,
            fontSize: badgeFontSize,
          }}
          title={level.label}
        >
          {level.shortLabel}
        </div>
      )}

      {hasStreakAura && isLarge && (
        <div
          className="absolute -left-1 -top-1 rounded-full bg-orange-500 px-2 py-1 text-xs font-black text-white shadow-md"
          title={`${streak} jours de streak`}
        >
          🔥 {streak}
        </div>
      )}
    </div>
  );
}