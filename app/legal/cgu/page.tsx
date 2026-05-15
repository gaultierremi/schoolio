import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "CGU · Maïa",
  description: "Conditions Générales d'Utilisation de la plateforme Maïa.",
};

export default function CguPage() {
  return <LegalPage slug="cgu" />;
}
