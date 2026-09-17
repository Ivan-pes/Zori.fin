import { gcFetch } from "./client";
import { env } from "../env";

export interface Institution {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  transaction_total_days?: string;
}

export function listInstitutions(country: string): Promise<Institution[]> {
  const c = (country || env.GOCARDLESS_COUNTRY).toUpperCase();
  return gcFetch<Institution[]>(`/institutions/?country=${c}`);
}

export interface Requisition {
  id: string;
  link: string;
  status: string;
  institution_id: string;
  accounts: string[];
  reference?: string;
}

export function createRequisition(
  institutionId: string,
  reference: string
): Promise<Requisition> {
  return gcFetch<Requisition>(`/requisitions/`, {
    method: "POST",
    body: JSON.stringify({
      institution_id: institutionId,
      redirect: `${env.APP_URL}/api/bank/callback`,
      reference,
      user_language: "EN",
    }),
  });
}

export function getRequisition(id: string): Promise<Requisition> {
  return gcFetch<Requisition>(`/requisitions/${id}/`);
}
