
export type ReportFrequency = "off" | "daily" | "weekly" | "monthly";

export function reportFrequencyFromPrefs(
  prefs: Record<string, unknown> | null | undefined
): ReportFrequency {
  const f = prefs?.reportFrequency;
  if (f === "off" || f === "daily" || f === "weekly" || f === "monthly") return f;
  if (prefs?.weekly === false) return "off";
  return "weekly";
}

export function shouldSendReport(freq: ReportFrequency, date: Date): boolean {
  if (freq === "off") return false;
  if (freq === "daily") return true;
  if (freq === "weekly") return date.getUTCDay() === 1;
  return date.getUTCDate() === 1;
}
