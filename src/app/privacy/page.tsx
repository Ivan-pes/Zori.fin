import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { privacyDoc } from "@/lib/legal";
import { LegalView } from "@/components/LegalView";

export const metadata: Metadata = {
  title: "Privacy Policy — Zori",
};

export default async function PrivacyPage() {
  const locale = await getLocale();
  return <LegalView doc={privacyDoc(locale)} />;
}
