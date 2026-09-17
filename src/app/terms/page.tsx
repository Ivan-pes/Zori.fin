import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { termsDoc } from "@/lib/legal";
import { LegalView } from "@/components/LegalView";

export const metadata: Metadata = {
  title: "Terms of Use — Zori",
};

export default async function TermsPage() {
  const locale = await getLocale();
  return <LegalView doc={termsDoc(locale)} />;
}
