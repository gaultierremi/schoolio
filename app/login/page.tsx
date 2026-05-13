import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Connexion · Maïa",
  description: "Connecte-toi à Maïa avec ton compte Google.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[rgb(var(--surface-2))] px-4 py-12">
      <LoginClient />
    </main>
  );
}
