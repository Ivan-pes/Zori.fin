import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Fraunces } from "next/font/google";
import { env } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const SITE_URL = env.APP_URL || "https://zori.finance";
const TITLE = "Zori — Финансовый директор в кармане";
const DESCRIPTION =
  "Загрузи банковскую выписку (CSV или PDF) или добавляй операции вручную — Zori посчитает прибыль, разложит траты по категориям и предупредит о кассовом разрыве до того, как он случится.";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Zori",
  openGraph: {
    type: "website",
    siteName: "Zori",
    title: TITLE,
    description: DESCRIPTION,
    locale: "ru_RU",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
