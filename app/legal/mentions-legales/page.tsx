import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Mentions légales · Maïa",
  description: "Mentions légales de la plateforme Maïa (éditeur, hébergeur, DPO).",
};

export default function MentionsLegalesPage() {
  return <LegalPage slug="mentions-legales" />;
}
