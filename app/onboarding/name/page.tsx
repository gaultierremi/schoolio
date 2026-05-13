import { Suspense } from "react";
import OnboardingNameClient from "./OnboardingNameClient";

export const dynamic = "force-dynamic";

export default function OnboardingNamePage() {
  return (
    <Suspense fallback={null}>
      <OnboardingNameClient />
    </Suspense>
  );
}
