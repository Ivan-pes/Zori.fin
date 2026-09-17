import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { buildWeeklyReport, sendWeeklyReport, type ReportOrgRow } from "@/lib/reports/weekly";
import { reportFrequencyFromPrefs, shouldSendReport } from "@/lib/reports/frequency";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { canP } from "@/lib/billing/entitlements.personal";
import { sendPersonalDigest } from "@/lib/personal/digest-email";

interface OrgRow extends ReportOrgRow {
  notification_prefs: Record<string, unknown> | null;
  type: string | null;
}

export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const orgs = await sql<OrgRow[]>`
    select o.id, o.name, o.current_balance_cents, o.safe_threshold_cents, o.notification_prefs, o.type, u.email as owner_email
    from organizations o
    join users u on u.id = o.owner_id
    where u.email is not null
  `;

  if (dry) {
    const previews: Array<{ org: string; to: string; subject: string; text: string }> = [];
    for (const org of orgs) {
      try {
        const r = await buildWeeklyReport(org);
        if (r) previews.push({ org: org.name, to: r.to, subject: r.subject, text: r.text });
      } catch (err) {
        console.error(`[weekly-report:dry] org ${org.id} не удался:`, err);
      }
    }
    return NextResponse.json({ dryRun: true, orgsConsidered: orgs.length, built: previews.length, previews });
  }

  const now = new Date();
  let reportsSent = 0;
  let skippedByFreq = 0;
  for (const org of orgs) {
    try {
      const freq = reportFrequencyFromPrefs(org.notification_prefs);
      if (!shouldSendReport(freq, now)) {
        skippedByFreq++;
        continue;
      }
      if (org.type === "personal") {
        // Личный дайджест — фича Plus.
        if (!canP(await getPersonalPlan(org.id), "digest")) continue;
        if ((await sendPersonalDigest(org.id, org.owner_email, org.name)) === "sent") reportsSent++;
      } else {
        const { plan } = await getOrgPlan(org.id);
        if (!can(plan, "weeklyReports")) continue;
        if ((await sendWeeklyReport(org)) === "sent") reportsSent++;
      }
    } catch (err) {
      console.error(`[weekly-report] org ${org.id} не удался:`, err);
    }
  }
  return NextResponse.json({ orgsConsidered: orgs.length, reportsSent, skippedByFreq });
}
