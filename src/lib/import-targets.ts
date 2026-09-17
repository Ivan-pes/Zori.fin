import { getAccessibleOrgs, getCurrentOrgId, canWrite } from "@/lib/session";

/**
 * Цели импорта выписки: `?targets=id1,id2` — одна выписка может лечь сразу
 * в несколько пространств пользователя (личное + бизнес). Без параметра —
 * текущее пространство. Каждая цель проверяется на право записи.
 */
export async function resolveImportTargets(
  targetsParam: string | null
): Promise<{ ok: true; orgIds: string[] } | { ok: false; error: string }> {
  const current = await getCurrentOrgId();
  if (!current) return { ok: false, error: "unauthorized" };

  const requested = (targetsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (requested.length === 0) return { ok: true, orgIds: [current] };

  const accessible = await getAccessibleOrgs();
  const writable = new Set(accessible.filter((o) => o.isOwner || canWrite(o.role)).map((o) => o.id));
  for (const id of requested) {
    if (!writable.has(id)) return { ok: false, error: "Нет доступа к одному из пространств" };
  }
  return { ok: true, orgIds: [...new Set(requested)] };
}
