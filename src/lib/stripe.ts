import Stripe from "stripe";

// Lazy Stripe client. Instantiating `new Stripe(...)` at module load crashes
// `next build` during page-data collection when STRIPE_SECRET_KEY isn't in the
// build environment (Vercel builds without runtime secrets). Defer construction
// until first use so a missing key fails at runtime, not at build time.
let _client: Stripe | null = null;

function getClient(): Stripe {
  if (!_client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _client = new Stripe(key);
  }
  return _client;
}

// Keep the existing `stripe.<resource>.<method>()` API working by delegating
// property access to the lazily-created client.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
  set(_target, prop, value) {
    (getClient() as unknown as Record<PropertyKey, unknown>)[prop] = value;
    return true;
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(getClient(), prop);
  },
  has(_target, prop) {
    return prop in getClient();
  },
  ownKeys() {
    return Reflect.ownKeys(getClient());
  },
});
