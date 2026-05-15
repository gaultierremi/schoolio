import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Politique cookies · Maïa",
  description: "Politique cookies Maïa — cookies essentiels, préférences utilisateur.",
};

export default function CookiesPage() {
  return <LegalPage slug="cookies" />;
}
