import Stripe from "stripe";
import { env } from "../env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? "sk_unset", {
  apiVersion: "2025-02-24.acacia",
});
