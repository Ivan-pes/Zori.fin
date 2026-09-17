import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalDoc } from "@/lib/legal";

const EMAIL = "support@zori.finance";

function linkify(seg: string): ReactNode {
  if (!seg.includes(EMAIL)) return seg;
  const [a, b] = seg.split(EMAIL);
  return (
    <>
      {a}
      <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      {b}
    </>
  );
}

function renderInline(text: string): ReactNode[] {
  return text.split("**").map((seg, i) =>
    i % 2 === 1 ? <strong key={i}>{linkify(seg)}</strong> : <span key={i}>{linkify(seg)}</span>
  );
}

export function LegalView({ doc }: { doc: LegalDoc }) {
  return (
    <div className="legal-doc">
      <Link href="/" className="back">{doc.back}</Link>
      <h1>{doc.title}</h1>
      <div className="upd">{doc.updated}</div>
      <p>{renderInline(doc.intro)}</p>
      {doc.sections.map((s, i) => (
        <div key={i}>
          <h2>{s.h}</h2>
          <p>{renderInline(s.p)}</p>
        </div>
      ))}
      <div className="note">{doc.note}</div>
    </div>
  );
}
