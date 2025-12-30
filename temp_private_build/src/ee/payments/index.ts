import type { Express } from "express";
import Stripe from "stripe";
import type { IAuthStorage } from "../../../server/replit_integrations/auth/storage";

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }
    stripe = new Stripe(key, { apiVersion: "2025-12-15.clover" });
  }
  return stripe;
}

export async function createCheckoutSession(authStorage: IAuthStorage, userId: string | number, email: string) {
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    throw new Error("STRIPE_PRO_PRICE_ID not configured");
  }

  const user = await authStorage.getUser(userId);
  let customerId = user?.stripeCustomerId;

  if (!customerId) {
    const customer = await getStripe().customers.create({
      email,
      metadata: { userId: userId.toString() },
    });
    customerId = customer.id;
    await authStorage.updateStripeCustomerId(userId, customerId);
  }

  const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN}` 
    : "http://localhost:5000";

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${baseUrl}/dashboard?upgrade=success`,
    cancel_url: `${baseUrl}/dashboard?upgrade=cancelled`,
    metadata: { userId: userId.toString() },
  });

  return session;
}

export async function createBillingPortalSession(authStorage: IAuthStorage, userId: string | number) {
  const user = await authStorage.getUser(userId);
  if (!user?.stripeCustomerId) {
    throw new Error("No Stripe customer found for this user");
  }

  const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN}` 
    : "http://localhost:5000";

  const session = await getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl}/dashboard`,
  });

  return session;
}

export async function getUserSubscriptionStatus(authStorage: IAuthStorage, userId: string | number) {
  const user = await authStorage.getUser(userId);
  if (!user) return null;

  return {
    accountType: user.accountType || "free",
    subscriptionStatus: user.subscriptionStatus,
    documentsUsed: user.documentsUsed || 0,
    documentsResetAt: user.documentsResetAt,
  };
}

export function constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
}

export async function handleWebhookEvent(authStorage: IAuthStorage, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId || "0";
      if (userId && userId !== "0") {
        const user = await authStorage.getUser(userId);
        if (user?.accountType !== "pro") {
          await authStorage.updateUserSubscription(userId, {
            accountType: "pro",
            stripeSubscriptionId: session.subscription as string,
            subscriptionStatus: "active",
          });
          console.log(`[Stripe] User ${userId} upgraded to Pro`);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const user = await authStorage.getUserByStripeSubscriptionId(subscription.id);
      if (user) {
        const status = subscription.status;
        const isPro = status === "active" || status === "trialing";
        await authStorage.updateUserSubscription(user.id, {
          accountType: isPro ? "pro" : "free",
          subscriptionStatus: status,
        });
        console.log(`[Stripe] Subscription ${subscription.id} updated: ${status}`);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const user = await authStorage.getUserByStripeSubscriptionId(subscription.id);
      if (user) {
        await authStorage.updateUserSubscription(user.id, {
          accountType: "free",
          subscriptionStatus: "canceled",
          stripeSubscriptionId: null,
        });
        console.log(`[Stripe] User ${user.id} downgraded to Free`);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionData = (invoice as any).subscription;
      const subscriptionId = typeof subscriptionData === 'string' 
        ? subscriptionData 
        : subscriptionData?.id;
      if (subscriptionId) {
        const user = await authStorage.getUserByStripeSubscriptionId(subscriptionId);
        if (user) {
          await authStorage.updateUserSubscription(user.id, {
            subscriptionStatus: "past_due",
          });
          console.log(`[Stripe] Payment failed for user ${user.id}`);
        }
      }
      break;
    }
  }
}

export function registerPaymentRoutes(app: Express, authStorage: IAuthStorage, isAuthenticated: any) {
  app.get("/api/subscription/status", isAuthenticated, async (req: any, res) => {
    try {
      const status = await getUserSubscriptionStatus(authStorage, req.session.userId);
      res.json(status);
    } catch (error) {
      console.error("Error getting subscription status:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  app.post("/api/subscription/checkout", isAuthenticated, async (req: any, res) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRO_PRICE_ID) {
        return res.status(503).json({ error: "Payment system not configured. Please contact support." });
      }

      const user = await authStorage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const status = await getUserSubscriptionStatus(authStorage, req.session.userId);
      if (status?.accountType === "pro") {
        return res.status(400).json({ error: "You already have a Pro subscription" });
      }

      const session = await createCheckoutSession(authStorage, user.id, user.email);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  app.post("/api/subscription/portal", isAuthenticated, async (req: any, res) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: "Payment system not configured. Please contact support." });
      }

      const session = await createBillingPortalSession(authStorage, req.session.userId);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating billing portal session:", error);
      res.status(500).json({ error: error.message || "Failed to create billing portal session" });
    }
  });

  app.post("/api/webhooks/stripe", async (req: any, res) => {
    const signature = req.headers["stripe-signature"] as string;

    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.warn("[Stripe] Webhook secret not configured, rejecting request");
      return res.status(503).json({ error: "Webhook not configured" });
    }

    try {
      const rawBody = req.rawBody;
      if (!rawBody) {
        return res.status(400).json({ error: "Missing raw body for webhook verification" });
      }

      const event = constructWebhookEvent(rawBody, signature);
      await handleWebhookEvent(authStorage, event);
      res.json({ received: true });
    } catch (error: any) {
      console.error("Stripe webhook error:", error.message);
      res.status(400).json({ error: `Webhook Error: ${error.message}` });
    }
  });

  console.log("[EE] Payment routes registered");
}

export const isPaymentsEnabled = () => !!process.env.STRIPE_SECRET_KEY;
