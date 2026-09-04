import { NextRequest, NextResponse } from "next/server";
import { generateAvailableSlots } from "@/lib/availability";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const creatorId = searchParams.get("creator_id");
  const offeringId = searchParams.get("offering_id");
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const minLead = searchParams.get("min_lead_minutes");

  if (!creatorId || !offeringId || !fromStr || !toStr) {
    return NextResponse.json(
      { error: "Missing required params: creator_id, offering_id, from, to" },
      { status: 400 },
    );
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json(
      { error: "Invalid date format. Use ISO 8601." },
      { status: 400 },
    );
  }

  try {
    const slots = await generateAvailableSlots({
      creator_id: creatorId,
      offering_id: offeringId,
      from,
      to,
      min_lead_minutes: minLead ? parseInt(minLead, 10) : undefined,
    });

    return NextResponse.json({ slots });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate availability" },
      { status: 500 },
    );
  }
}
