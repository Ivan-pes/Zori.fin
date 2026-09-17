import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getOrgPlan } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { resolveHistoryFloor } from "@/lib/billing/history";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = ["Дата", "Описание", "Категория", "Источник", "Тип", "Сумма", "Валюта"] as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const [org] = await sql<{ id: string }[]>`
    select id from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) return NextResponse.json({ error: "no organization" }, { status: 400 });

  const { plan } = await getOrgPlan(org.id);
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  if (format === "xlsx") {
    if (!can(plan, "exportExcel")) {
      return NextResponse.json({ error: "Экспорт в Excel доступен на тарифе Pro." }, { status: 403 });
    }
  } else if (format === "csv") {
    if (plan === "free") {
      return NextResponse.json({ error: "Экспорт доступен на тарифе Starter и выше." }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Неподдерживаемый формат" }, { status: 400 });
  }

  const floor = await resolveHistoryFloor(org.id);
  const rows = await sql<
    {
      occurred_at: Date; description: string | null; category: string | null;
      source: string; direction: string; gross_cents: string; currency: string;
    }[]
  >`
    select occurred_at, description, category, source, direction, gross_cents, currency
    from transactions
    where org_id = ${org.id} ${floor ? sql`and occurred_at >= ${floor}` : sql``}
    order by occurred_at desc, id asc
  `;

  const stamp = new Date().toISOString().slice(0, 10);

  const toRow = (r: (typeof rows)[number]) => {
    const amount = (Number(r.gross_cents) / 100) * (r.direction === "expense" ? -1 : 1);
    return {
      date: new Date(r.occurred_at).toISOString().slice(0, 10),
      description: r.description ?? "",
      category: r.category ?? "",
      source: r.source,
      type: r.direction === "expense" ? "расход" : "доход",
      amount,
      currency: r.currency,
    };
  };

  if (format === "xlsx") {
    const aoa: (string | number)[][] = [
      [...HEADER],
      ...rows.map((r) => {
        const x = toRow(r);
        return [x.date, x.description, x.category, x.source, x.type, x.amount, x.currency];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Транзакции");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="zori-transactions-${stamp}.xlsx"`,
      },
    });
  }

  const lines = [HEADER.join(",")];
  for (const r of rows) {
    const x = toRow(r);
    lines.push([
      csvCell(x.date), csvCell(x.description), csvCell(x.category), csvCell(x.source),
      csvCell(x.type), csvCell(x.amount.toFixed(2)), csvCell(x.currency),
    ].join(","));
  }
  const csv = "﻿" + lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zori-transactions-${stamp}.csv"`,
    },
  });
}
