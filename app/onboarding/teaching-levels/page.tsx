import { Suspense } from "react";
import OnboardingTeachingLevelsClient from "./OnboardingTeachingLevelsClient";
import { currentAcademicYear } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function OnboardingTeachingLevelsPage() {
  const academicYear = currentAcademicYear();
  return (
    <Suspense fallback={null}>
      <OnboardingTeachingLevelsClient academicYear={academicYear} />
    </Suspense>
  );
}
