import { Flame } from "lucide-react";
import SignOutButton from "./SignOutButton";

type Identity = {
  firstName: string;
  lastName: string | null;
  pseudo: string;
};

type Props = {
  displayName: string;
  streak: number;
  classCount: number;
  identity?: Identity | null;
};

export default function StreakHeroCard({ displayName, streak, classCount, identity }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="serif text-3xl font-black text-[rgb(var(--ink))]">🎒 Bonjour, {displayName} !</h1>
          {streak > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--accent-soft))]/30 px-3 py-1 text-sm font-black text-[rgb(var(--accent))]">
              <Flame className="h-4 w-4" aria-hidden />
              {streak} jour{streak > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[rgb(var(--ink-2))]">
          Espace élève · {classCount} classe{classCount !== 1 ? "s" : ""}
        </p>
        {identity?.pseudo && (
          <p className="mt-0.5 text-xs text-[rgb(var(--ink-3))]">
            Connecté en tant que {identity.firstName}
            {identity.lastName ? ` ${identity.lastName}` : ""}{" "}
            (pseudo&nbsp;: {identity.pseudo})
          </p>
        )}
      </div>
      <SignOutButton />
    </div>
  );
}
