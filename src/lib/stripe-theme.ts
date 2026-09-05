import type { Appearance } from "@stripe/stripe-js";

const dark: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#FFFFFF",
    colorBackground: "#1A1A1A",
    colorText: "#FFFFFF",
    colorDanger: "#EF4444",
    borderRadius: "12px",
  },
};

const light: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#121212",
    colorBackground: "#FFFFFF",
    colorText: "#121212",
    colorDanger: "#EF4444",
    borderRadius: "12px",
  },
};

export function getStripeAppearance(theme: "dark" | "light"): Appearance {
  return theme === "light" ? light : dark;
}

export const STRIPE_APPEARANCE = dark;
