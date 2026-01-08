const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function findUserIdBySubscription(sub) {
  if (!sub) return null;
  const { data: bySub } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (bySub?.user_id) return bySub.user_id;

  if (sub.customer) {
    const { data: byCustomer } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", sub.customer)
      .maybeSingle();
    if (byCustomer?.user_id) return byCustomer.user_id;
  }

  return null;
}

async function upsertSubscription(userId, sub) {
  if (!userId || !sub) return;

  await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: sub.customer ?? null,
    stripe_subscription_id: sub.id ?? null,
    stripe_price_id: sub.items?.data?.[0]?.price?.id ?? null,
    status: sub.status ?? null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    res.status(400).send("Missing stripe-signature");
    return;
  }

  let rawBody = null;
  if (Buffer.isBuffer(req.body)) {
    rawBody = req.body;
  } else if (typeof req.body === "string") {
    rawBody = Buffer.from(req.body, "utf8");
  } else {
    rawBody = await getRawBody(req);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        if (!userId) break;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription
          );
          await upsertSubscription(userId, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = await findUserIdBySubscription(sub);
        if (userId) {
          await upsertSubscription(userId, sub);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", invoice.customer);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", invoice.customer);
        break;
      }
      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).send("Webhook handler failed");
  }
};
