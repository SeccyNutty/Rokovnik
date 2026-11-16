import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} · ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description:
    "Predavanja, radionice, natjecanja, stipendije i rokovi prijava koje objavljuju fakulteti, udruge i gradovi. Prati ih na jednom mjestu ili u svom kalendaru.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hr">
      <body>{children}</body>
    </html>
  );
}
