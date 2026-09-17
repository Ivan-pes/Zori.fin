import { env } from "../env";
import { stripe } from "./client";

export function getStripeConnectUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.STRIPE_CLIENT_ID ?? "",
    scope: "read_write",
    redirect_uri: env.STRIPE_CONNECT_REDIRECT_URI ?? "",
    state,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export interface StripeOAuthResult {
  stripeUserId: string;
  accessToken: string | null;
}

export async function exchangeStripeCode(
  code: string
): Promise<StripeOAuthResult> {
  const res = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });
  if (!res.stripe_user_id) {
    throw new Error("Stripe OAuth: missing stripe_user_id in response");
  }
  return {
    stripeUserId: res.stripe_user_id,
    accessToken: res.access_token ?? null,
  };
}
