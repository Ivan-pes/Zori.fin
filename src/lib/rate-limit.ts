import { sql } from "./db";

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;

export async function isRateLimited(email: string): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from login_attempts
    where email = ${email}
      and created_at > now() - (${WINDOW_MINUTES} * interval '1 minute')
  `;
  return (row?.n ?? 0) >= MAX_FAILURES;
}

export async function recordFailedAttempt(
  email: string,
  ip: string | null
): Promise<void> {
  await sql`insert into login_attempts (email, ip) values (${email}, ${ip})`;
}

export async function clearAttempts(email: string): Promise<void> {
  await sql`delete from login_attempts where email = ${email}`;
}


export async function isActionLimited(
  key: string,
  max: number,
  windowMinutes: number
): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from login_attempts
    where email = ${key}
      and created_at > now() - (${windowMinutes} * interval '1 minute')
  `;
  return (row?.n ?? 0) >= max;
}

export async function recordAction(key: string, ip: string | null): Promise<void> {
  await sql`insert into login_attempts (email, ip) values (${key}, ${ip})`;
}

export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0]!.trim() : null;
}
