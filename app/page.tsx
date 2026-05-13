import MaiaMarketingHeader from "@/components/marketing/MaiaMarketingHeader";
import MaiaHero from "@/components/marketing/MaiaHero";
import MaiaProblem from "@/components/marketing/MaiaProblem";
import MaiaPromises from "@/components/marketing/MaiaPromises";
import MaiaProcess from "@/components/marketing/MaiaProcess";
import MaiaProgramme from "@/components/marketing/MaiaProgramme";
import MaiaSecurity from "@/components/marketing/MaiaSecurity";
import MaiaPilot from "@/components/marketing/MaiaPilot";
import MaiaFAQ from "@/components/marketing/MaiaFAQ";
import MaiaQuote from "@/components/marketing/MaiaQuote";
import MaiaFooter from "@/components/marketing/MaiaFooter";

// Public marketing landing — statically rendered (no auth check, no force-dynamic).
// Logged-in users navigate via the header "Connexion" link → /login → middleware
// redirects by role (/student or /school).

export default function MaiaLandingPage() {
  return (
    <>
      <MaiaMarketingHeader />
      <main>
        <MaiaHero />
        <MaiaProblem />
        <MaiaPromises />
        <MaiaProcess />
        <MaiaProgramme />
        <MaiaSecurity />
        <MaiaPilot />
        <MaiaFAQ />
        <MaiaQuote />
      </main>
      <MaiaFooter />
    </>
  );
}
