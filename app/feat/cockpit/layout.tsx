import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Maia Cockpit",
  description: "Co-pilote pédagogique pour enseignants",
  appleWebApp: {
    capable: true,
    title: "Maia Cockpit",
    statusBarStyle: "black-translucent",
  },
  manifest: undefined,
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function CockpitLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
