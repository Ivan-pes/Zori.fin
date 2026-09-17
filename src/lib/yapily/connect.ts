import { ypFetch } from "./client";
import { env } from "../env";

export interface YpInstitution {
  id: string;
  name: string;
  fullName?: string;
  countries?: { countryCode2?: string }[];
  media?: { source?: string; type?: string }[];
  environmentType?: string; // SANDBOX | LIVE
}

export async function listInstitutions(country: string): Promise<YpInstitution[]> {
  const data = await ypFetch<{ data?: YpInstitution[] }>(`/institutions`);
  const all = data.data ?? [];
  const c = (country || env.GOCARDLESS_COUNTRY).toUpperCase();
  // Банки выбранной страны + песочницы: до верификации приложения Yapily
  // отдаёт только sandbox-банки, без них список был бы пуст.
  return all.filter(
    (i) =>
      i.environmentType === "SANDBOX" ||
      (i.countries ?? []).some((x) => x.countryCode2?.toUpperCase() === c)
  );
}

export function institutionLogo(i: YpInstitution): string | null {
  const media = i.media ?? [];
  return (
    media.find((m) => m.type === "icon")?.source ??
    media.find((m) => m.type === "logo")?.source ??
    null
  );
}

export interface YpAuthRequest {
  id: string;
  userUuid?: string;
  authorisationUrl: string;
  status?: string;
}

// Hosted-flow: Yapily вернёт authorisationUrl (страница банка), после
// подтверждения пользователь вернётся на callback с ?consent=<токен>.
// callback-URL должен быть зарегистрирован в приложении на console.yapily.com.
export async function createAuthRequest(opts: {
  orgId: string;
  institutionId: string;
}): Promise<YpAuthRequest> {
  const data = await ypFetch<{ data: YpAuthRequest }>(`/account-auth-requests`, {
    method: "POST",
    body: JSON.stringify({
      applicationUserId: opts.orgId,
      institutionId: opts.institutionId,
      callback: `${env.APP_URL}/api/bank/callback`,
    }),
  });
  return data.data;
}
