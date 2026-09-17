"use client";

export function PrintButton({ label = "Экспорт" }: { label?: string }) {
  return (
    <button className="btn btn-line btn-sm" onClick={() => window.print()}>
      {label}
    </button>
  );
}
