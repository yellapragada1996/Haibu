import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { FeeForm } from "./FeeForm";

export default async function AdminSettingsPage() {
  const [row] = await db
    .select({ platform_fee_rate: platformSettings.platform_fee_rate })
    .from(platformSettings)
    .limit(1);

  const currentRate = row?.platform_fee_rate ?? 0.18;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-text-primary">Settings</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Platform configuration
      </p>
      <FeeForm currentRate={currentRate} />
    </div>
  );
}
