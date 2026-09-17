import Link from "next/link";
import { Brand } from "@/components/Brand";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

export default async function NotFound() {
  const tr = translator(await getLocale());
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px 24px",
        gap: 18,
      }}
    >
      <Link href="/" style={{ textDecoration: "none", color: "inherit" }}><Brand /></Link>
      <div style={{ fontSize: 64, fontWeight: 700, fontFamily: "var(--font-fraunces), Georgia, serif", color: "var(--ink)", lineHeight: 1 }}>404</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{tr("nf.title")}</h1>
      <p style={{ color: "var(--ink-soft)", maxWidth: "42ch", margin: 0 }}>
        {tr("nf.body")}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
        <Link href="/" className="btn btn-dark" style={{ padding: "11px 20px" }}>{tr("nf.home")}</Link>
        <Link href="/app" className="btn btn-line" style={{ padding: "11px 20px" }}>{tr("nf.toApp")}</Link>
      </div>
    </main>
  );
}
