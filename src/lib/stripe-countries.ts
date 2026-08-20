// Countries supported by Stripe Express hosted onboarding. Shared by the
// SetupWizard dropdown (client) and startStripeOnboarding validation (server)
// so the two can never drift apart.

export const STRIPE_EXPRESS_COUNTRIES: { value: string; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "AT", label: "Austria" },
  { value: "BE", label: "Belgium" },
  { value: "BG", label: "Bulgaria" },
  { value: "CY", label: "Cyprus" },
  { value: "CZ", label: "Czech Republic" },
  { value: "DK", label: "Denmark" },
  { value: "EE", label: "Estonia" },
  { value: "FI", label: "Finland" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "GR", label: "Greece" },
  { value: "HK", label: "Hong Kong" },
  { value: "HU", label: "Hungary" },
  { value: "IE", label: "Ireland" },
  { value: "IT", label: "Italy" },
  { value: "JP", label: "Japan" },
  { value: "LV", label: "Latvia" },
  { value: "LI", label: "Liechtenstein" },
  { value: "LT", label: "Lithuania" },
  { value: "LU", label: "Luxembourg" },
  { value: "MT", label: "Malta" },
  { value: "MX", label: "Mexico" },
  { value: "NL", label: "Netherlands" },
  { value: "NZ", label: "New Zealand" },
  { value: "NO", label: "Norway" },
  { value: "PL", label: "Poland" },
  { value: "PT", label: "Portugal" },
  { value: "RO", label: "Romania" },
  { value: "SG", label: "Singapore" },
  { value: "SK", label: "Slovakia" },
  { value: "SI", label: "Slovenia" },
  { value: "ES", label: "Spain" },
  { value: "SE", label: "Sweden" },
  { value: "CH", label: "Switzerland" },
  { value: "GB", label: "United Kingdom" },
];

export const STRIPE_EXPRESS_COUNTRY_CODES = STRIPE_EXPRESS_COUNTRIES.map(
  (c) => c.value,
);
