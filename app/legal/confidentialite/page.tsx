import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Politique de confidentialité · Maïa",
  description:
    "Politique de confidentialité Maïa — données collectées, finalités, droits RGPD, sous-traitants.",
};

export default function ConfidentialitePage() {
  return <LegalPage slug="confidentialite" />;
}
