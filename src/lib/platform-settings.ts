import { db } from "@/db";
import { platformSettings } from "@/db/schema";

const DEFAULT_FEE_RATE = 0.18;

export async function getPlatformFeeRate(): Promise<number> {
  const [row] = await db
    .select({ platform_fee_rate: platformSettings.platform_fee_rate })
    .from(platformSettings)
    .limit(1);
  return row?.platform_fee_rate ?? DEFAULT_FEE_RATE;
}
