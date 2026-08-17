// Stripe Elements theming — third-party config. Raw hex is a documented
// exception: Stripe's appearance API needs color strings, and cannot reference
// the app's @theme CSS variables. See haibu-design-token-system.md.
export const STRIPE_APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#FFFFFF",
    colorBackground: "#1A1A1A",
    colorText: "#FFFFFF",
    colorDanger: "#EF4444",
    borderRadius: "12px",
  },
};
