import { sql } from "./db";

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerified: Date | null;
  twofaMethod: "totp" | "email" | null;
  twofaSecret: string | null;
}

interface Row {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified: Date | null;
  twofa_method: "totp" | "email" | null;
  twofa_secret: string | null;
}

function toUser(u: Row): UserRow {
  return {
    id: u.id,
    email: u.email,
    passwordHash: u.password_hash,
    emailVerified: u.email_verified,
    twofaMethod: u.twofa_method,
    twofaSecret: u.twofa_secret,
  };
}

const COLS = sql`id, email, password_hash, email_verified, twofa_method, twofa_secret`;

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const [u] = await sql<Row[]>`
    select ${COLS} from users where email = ${email} limit 1
  `;
  return u ? toUser(u) : null;
}

export async function createUser(
  email: string,
  passwordHash: string
): Promise<UserRow> {
  const [u] = await sql<Row[]>`
    insert into users (email, password_hash)
    values (${email}, ${passwordHash})
    returning ${COLS}
  `;
  return toUser(u!);
}

export async function createOAuthUser(email: string): Promise<UserRow> {
  const [u] = await sql<Row[]>`
    insert into users (email, email_verified)
    values (${email}, now())
    returning ${COLS}
  `;
  return toUser(u!);
}
