import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { sql } from "@/lib/db";
import { getUserByEmail, createOAuthUser } from "@/lib/users";
import { startProTrial } from "@/lib/billing/plan";
import { verifyPassword } from "@/lib/password";
import { decrypt } from "@/lib/crypto";
import { verifyTotp, verifyEmailCode } from "@/lib/twofa";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit";
import { activateInvitesForUser } from "@/lib/team";
import { env } from "@/lib/env";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Пароль", type: "password" },
      code: { label: "Код 2FA", type: "text" },
    },
    authorize: async (creds, request) => {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      const code = String(creds?.code ?? "");
      if (!email || !password) return null;

      if (await isRateLimited(email)) return null;

      const user = await getUserByEmail(email);
      const ok = user?.passwordHash
        ? await verifyPassword(password, user.passwordHash)
        : false;

      if (!user || !ok) {
        const ip = request?.headers.get("x-forwarded-for") ?? null;
        await recordFailedAttempt(email, ip);
        return null;
      }

      await clearAttempts(email);
      if (!user.emailVerified) return null;

      if (user.twofaMethod === "totp") {
        if (!user.twofaSecret || !code || !verifyTotp(decrypt(user.twofaSecret), code)) return null;
      } else if (user.twofaMethod === "email") {
        if (!code || !(await verifyEmailCode(email, code, "login"))) return null;
      }

      return { id: user.id, email: user.email };
    },
  }),
];

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase().trim();
        if (!email) return false;
        let dbUser = await getUserByEmail(email);
        if (!dbUser) {
          dbUser = await createOAuthUser(email);
          const orgName = (user.name?.trim() || "Мой бизнес").slice(0, 80);
          const [org] = await sql<{ id: string }[]>`
            insert into organizations (owner_id, name) values (${dbUser.id}, ${orgName})
            returning id
          `;
          if (org) await startProTrial(org.id);
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google" && user.email) {
          const dbUser = await getUserByEmail(user.email.toLowerCase().trim());
          if (dbUser) token.id = dbUser.id;
        } else {
          token.id = (user as { id: string }).id;
        }
        if (token.id && user.email) {
          await activateInvitesForUser(token.id as string, user.email);
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
