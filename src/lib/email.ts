import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Resend transactional email — booking reminders.
//
// Branded template matches the rest of Haibu's email: dark background
// #121212, card #1A1A1A, centered logo (tight viewBox), #2A2A2A divider,
// #8A8A8A body text, footer "© 2026 Haibu · Toronto, ON, Canada". No emojis,
// no dashes. Four authoritative templates (2 timings × 2 roles).
// ---------------------------------------------------------------------------

const FROM_ADDRESS = "Haibu <noreply@mail.haibu.live>";
const APP_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://haibu.live";

const LOGO_SVG =
  '<svg width="140" height="55" viewBox="0 8 102 40" xmlns="http://www.w3.org/2000/svg">' +
  '<text x="0" y="41" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="600" letter-spacing="-0.5" fill="#FFFFFF">haibu</text>' +
  '<circle cx="97" cy="35" r="5" fill="#A81120"/></svg>';

export type ReminderWindow = "1h" | "15m" | "imminent";
export type ReminderRole = "guest" | "creator";

export interface ReminderParty {
  name: string;
  email: string;
  timezone: string;
}

export interface ReminderInput {
  window: ReminderWindow;
  bookingId: string;
  offeringTitle: string;
  creator: ReminderParty;
  guest: ReminderParty;
  startAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

// Session start time in the recipient's own IANA timezone, e.g. "3:00 PM EDT".
function formatStartTime(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).formatToParts(date);
    const pick = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const hour = pick("hour");
    const minute = pick("minute");
    const dayPeriod = pick("dayPeriod");
    const zone = pick("timeZoneName");
    const time = `${hour}:${minute}${dayPeriod ? ` ${dayPeriod}` : ""}`;
    return zone ? `${time} ${zone}` : time;
  } catch {
    return (
      date.toLocaleTimeString("en-US", {
        timeZone: "UTC",
        hour: "numeric",
        minute: "2-digit",
      }) + " UTC"
    );
  }
}

// The booking detail page is where the "Join session" button lives for both
// the guest and creator roles. Emails need an absolute URL.
function bookingUrl(bookingId: string): string {
  return `${APP_URL}/bookings/${bookingId}`;
}

// ---------------------------------------------------------------------------
// The four authoritative templates. Placeholders: {{OFFERING_NAME}},
// {{CREATOR_NAME}}, {{GUEST_NAME}}, {{START_TIME}}, {{BOOKING_URL}}.
// ---------------------------------------------------------------------------

function document(title: string, heading: string, bodyHtml: string): string {
  return (
    "<!DOCTYPE html>\n" +
    "<html>\n" +
    "<head>\n" +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${title}</title>\n` +
    "</head>\n" +
    '<body style="margin:0;padding:0;background-color:#121212;font-family:-apple-system,BlinkMacSystemFont,\'Inter\',\'Segoe UI\',sans-serif;">\n' +
    '  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121212;padding:40px 20px;">\n' +
    "    <tr>\n" +
    '      <td align="center" valign="top">\n' +
    '        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#1A1A1A;border-radius:16px;overflow:hidden;">\n' +
    "\n" +
    "          <tr>\n" +
    '            <td align="center" style="padding:44px 40px 32px;">\n' +
    `              ${LOGO_SVG}\n` +
    "            </td>\n" +
    "          </tr>\n" +
    "\n" +
    "          <tr>\n" +
    '            <td style="padding:0 40px;">\n' +
    '              <div style="height:1px;background-color:#2A2A2A;"></div>\n' +
    "            </td>\n" +
    "          </tr>\n" +
    "\n" +
    "          <tr>\n" +
    '            <td style="padding:36px 40px 28px;">\n' +
    `              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#FFFFFF;line-height:1.3;">${heading}</p>\n` +
    bodyHtml +
    "            </td>\n" +
    "          </tr>\n" +
    "\n" +
    "          <tr>\n" +
    '            <td style="padding:0 40px 36px;">\n' +
    '              <div style="height:1px;background-color:#2A2A2A;margin-bottom:20px;"></div>\n' +
    '              <p style="margin:0;font-size:12px;color:#5A5A5A;line-height:1.6;text-align:center;">\n' +
    "                &copy; 2026 Haibu &nbsp;&middot;&nbsp; Toronto, ON, Canada\n" +
    "              </p>\n" +
    "            </td>\n" +
    "          </tr>\n" +
    "\n" +
    "        </table>\n" +
    "      </td>\n" +
    "    </tr>\n" +
    "  </table>\n" +
    "</body>\n" +
    "</html>"
  );
}

const BODY_1H_GUEST =
  '              <p style="margin:0 0 28px;font-size:15px;color:#8A8A8A;line-height:1.7;">\n' +
  "                Hey, just a heads up that your {{OFFERING_NAME}} session with {{CREATOR_NAME}} starts at {{START_TIME}}. Your join link will be ready 5 minutes before it begins.\n" +
  "              </p>\n" +
  '              <p style="margin:0;font-size:15px;color:#8A8A8A;line-height:1.7;">\n' +
  "                See you soon.\n" +
  "              </p>\n";

const BODY_1H_CREATOR =
  '              <p style="margin:0;font-size:15px;color:#8A8A8A;line-height:1.7;">\n' +
  "                Reminder that your {{OFFERING_NAME}} session with {{GUEST_NAME}} starts at {{START_TIME}}. Your join link will be ready 5 minutes before it begins.\n" +
  "              </p>\n";

const BODY_15M_GUEST =
  '              <p style="margin:0 0 32px;font-size:15px;color:#8A8A8A;line-height:1.7;">\n' +
  "                Your {{OFFERING_NAME}} session with {{CREATOR_NAME}} is almost here. Head to your booking page to join when you're ready.\n" +
  "              </p>\n" +
  '              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">\n' +
  "                <tr>\n" +
  '                  <td align="center">\n' +
  '                    <a href="{{BOOKING_URL}}" style="display:inline-block;background-color:#FFFFFF;color:#121212;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:999px;">Join session</a>\n' +
  "                  </td>\n" +
  "                </tr>\n" +
  "              </table>\n" +
  '              <p style="margin:0;font-size:13px;color:#5A5A5A;line-height:1.7;text-align:center;">\n' +
  "                If the button doesn't work, copy and paste this link into your browser:<br>\n" +
  '                <span style="color:#8A8A8A;word-break:break-all;">{{BOOKING_URL}}</span>\n' +
  "              </p>\n";

const BODY_15M_CREATOR =
  '              <p style="margin:0 0 32px;font-size:15px;color:#8A8A8A;line-height:1.7;">\n' +
  "                Your {{OFFERING_NAME}} session with {{GUEST_NAME}} is starting soon. Head to your booking page when you're ready.\n" +
  "              </p>\n" +
  '              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">\n' +
  "                <tr>\n" +
  '                  <td align="center">\n' +
  '                    <a href="{{BOOKING_URL}}" style="display:inline-block;background-color:#FFFFFF;color:#121212;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:999px;">Join session</a>\n' +
  "                  </td>\n" +
  "                </tr>\n" +
  "              </table>\n" +
  '              <p style="margin:0;font-size:13px;color:#5A5A5A;line-height:1.7;text-align:center;">\n' +
  "                If the button doesn't work, copy and paste this link into your browser:<br>\n" +
  '                <span style="color:#8A8A8A;word-break:break-all;">{{BOOKING_URL}}</span>\n' +
  "              </p>\n";

const BODY_IMMINENT_GUEST =
  '              <p style="margin:0 0 32px;font-size:15px;color:#8A8A8A;line-height:1.7;">\n' +
  "                Your {{OFFERING_NAME}} session with {{CREATOR_NAME}} starts in just a few minutes. Head to your booking page to join when you're ready.\n" +
  "              </p>\n" +
  '              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">\n' +
  "                <tr>\n" +
  '                  <td align="center">\n' +
  '                    <a href="{{BOOKING_URL}}" style="display:inline-block;background-color:#FFFFFF;color:#121212;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:999px;">Join session</a>\n' +
  "                  </td>\n" +
  "                </tr>\n" +
  "              </table>\n" +
  '              <p style="margin:0;font-size:13px;color:#5A5A5A;line-height:1.7;text-align:center;">\n' +
  "                If the button doesn't work, copy and paste this link into your browser:<br>\n" +
  '                <span style="color:#8A8A8A;word-break:break-all;">{{BOOKING_URL}}</span>\n' +
  "              </p>\n";

const BODY_IMMINENT_CREATOR =
  '              <p style="margin:0 0 32px;font-size:15px;color:#8A8A8A;line-height:1.7;">\n' +
  "                Your {{OFFERING_NAME}} session with {{GUEST_NAME}} is starting in just a few minutes. Head to your booking page when you're ready.\n" +
  "              </p>\n" +
  '              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">\n' +
  "                <tr>\n" +
  '                  <td align="center">\n' +
  '                    <a href="{{BOOKING_URL}}" style="display:inline-block;background-color:#FFFFFF;color:#121212;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:999px;">Join session</a>\n' +
  "                  </td>\n" +
  "                </tr>\n" +
  "              </table>\n" +
  '              <p style="margin:0;font-size:13px;color:#5A5A5A;line-height:1.7;text-align:center;">\n' +
  "                If the button doesn't work, copy and paste this link into your browser:<br>\n" +
  '                <span style="color:#8A8A8A;word-break:break-all;">{{BOOKING_URL}}</span>\n' +
  "              </p>\n";

interface Variant {
  title: string;
  heading: string;
  body: string;
}

const VARIANTS: Record<ReminderWindow, Record<ReminderRole, Variant>> = {
  "1h": {
    guest: {
      title: "Your session is in 1 hour",
      heading: "Your session is in 1 hour",
      body: BODY_1H_GUEST,
    },
    creator: {
      title: "You have a session in 1 hour",
      heading: "You have a session in 1 hour",
      body: BODY_1H_CREATOR,
    },
  },
  "15m": {
    guest: {
      title: "Your session starts in 15 minutes",
      heading: "Your session starts in 15 minutes",
      body: BODY_15M_GUEST,
    },
    creator: {
      title: "Your session starts in 15 minutes",
      heading: "Your session starts in 15 minutes",
      body: BODY_15M_CREATOR,
    },
  },
  imminent: {
    guest: {
      title: "Your session starts soon",
      heading: "You're all set",
      body: BODY_IMMINENT_GUEST,
    },
    creator: {
      title: "You have a session starting soon",
      heading: "You have a session starting soon",
      body: BODY_IMMINENT_CREATOR,
    },
  },
};

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{\{(OFFERING_NAME|CREATOR_NAME|GUEST_NAME|START_TIME|BOOKING_URL)\}\}/g,
    (_, key: string) => vars[key] ?? "",
  );
}

function subjectFor(window: ReminderWindow, role: ReminderRole, otherName: string): string {
  if (window === "1h") {
    return role === "guest"
      ? `Your session with ${otherName} is in 1 hour`
      : "You have a session in 1 hour";
  }
  if (window === "imminent") {
    return role === "guest"
      ? "Your session starts soon"
      : "You have a session starting soon";
  }
  return "Your session starts in 15 minutes";
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export async function sendBookingReminder(
  input: ReminderInput,
): Promise<{ sent: number; errors: string[] }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const message =
      "[email] RESEND_API_KEY is not set; booking reminder emails skipped";
    console.error(message);
    return { sent: 0, errors: [message] };
  }

  const resend = new Resend(apiKey);
  const parties: { role: ReminderRole; party: ReminderParty }[] = [
    { role: "guest", party: input.guest },
    { role: "creator", party: input.creator },
  ];

  let sent = 0;
  const errors: string[] = [];

  for (const { role, party } of parties) {
    const otherName = role === "guest" ? input.creator.name : input.guest.name;
    const subject = subjectFor(input.window, role, otherName);
    const variant = VARIANTS[input.window][role];
    const vars: Record<string, string> = {
      OFFERING_NAME: escapeHtml(input.offeringTitle),
      CREATOR_NAME: escapeHtml(input.creator.name),
      GUEST_NAME: escapeHtml(input.guest.name),
      START_TIME: escapeHtml(formatStartTime(input.startAt, party.timezone)),
      BOOKING_URL: escapeHtml(bookingUrl(input.bookingId)),
    };
    const html = document(
      variant.title,
      variant.heading,
      substitute(variant.body, vars),
    );

    try {
      const { data, error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: party.email,
        subject,
        html,
      });
      if (error) {
        const message = `[email] failed to send ${input.window} ${role} reminder for booking ${input.bookingId}: ${error.message}`;
        console.error(message);
        errors.push(message);
      } else {
        console.log(
          `[email] sent ${input.window} ${role} reminder for booking ${input.bookingId} (${data?.id ?? "no id"})`,
        );
        sent++;
      }
    } catch (err) {
      const message = `[email] exception sending ${input.window} ${role} reminder for booking ${input.bookingId}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(message);
      errors.push(message);
    }
  }

  return { sent, errors };
}


// ---------------------------------------------------------------------------
// Cancellation emails — 6 templates (3 scenarios × 2 roles).
//
// Fired from cancel.ts (guest/creator cancellation) and admin/actions.ts
// (force-cancel, no-show refund override, review refund) only AFTER the status
// transition has committed. Same branded shell as the reminders.
//
// Templates:
//   1. guest cancelled → guest      (REFUND_TEXT)
//   2. guest cancelled → creator    (COMPENSATION_TEXT)
//   3. creator cancelled → guest    (full refund, fixed)
//   4. creator cancelled → creator  (confirmation, no money info)
//   5. admin cancelled → guest      (REFUND_TEXT)
//   6. admin cancelled → creator    (neutral, no-blame)
// ---------------------------------------------------------------------------

export type CancellationScenario =
  | "guest_cancelled"
  | "creator_cancelled"
  | "admin_cancelled";

export interface CancellationParty {
  name: string;
  email: string;
  timezone: string;
}

export interface CancellationInput {
  scenario: CancellationScenario;
  bookingId: string;
  offeringTitle: string;
  creator: CancellationParty;
  guest: CancellationParty;
  startAt: Date;
  priceCents: number;
  creatorPayoutCents: number;
  refundPercent: number; // 0..1; guest-cancel tier, else 1.0
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// §3 — the guest's refund tier, rendered in their own words.
function refundText(refundPercent: number, priceCents: number): string {
  const amount = money(Math.round(priceCents * refundPercent));
  if (refundPercent >= 1) return `You'll receive a full refund of ${amount}.`;
  if (refundPercent > 0) {
    return `You'll receive a ${Math.round(refundPercent * 100)}% refund of ${amount}.`;
  }
  return "No refund applies at this stage.";
}

// §3 — the creator's mirror of the guest's tier.
function compensationText(
  refundPercent: number,
  creatorPayoutCents: number,
): string {
  if (refundPercent >= 1) return "No compensation — the guest was fully refunded.";
  const amount = money(Math.round(creatorPayoutCents * (1 - refundPercent)));
  if (refundPercent > 0) {
    return `You'll receive ${amount} as compensation (${Math.round(refundPercent * 100)}% of the session was refunded to the guest).`;
  }
  return `You'll receive the full payout of ${amount} (minus the platform fee).`;
}

function infoBox(text: string): string {
  return (
    '              <div style="background-color:#121212;border-radius:12px;padding:20px 24px;border:1px solid #2A2A2A;">\n' +
    `                <p style="margin:0;font-size:15px;color:#FFFFFF;line-height:1.7;">${text}</p>\n` +
    "              </div>\n"
  );
}

function para(text: string, bottom = true): string {
  const margin = bottom ? "0 0 24px" : "0";
  return `              <p style="margin:${margin};font-size:15px;color:#8A8A8A;line-height:1.7;">${text}</p>\n`;
}

function smallNote(text: string, top = true): string {
  return `              <p style="margin:${top ? "20px 0 0" : "0"};font-size:13px;color:#5A5A5A;line-height:1.7;">${text}</p>\n`;
}

interface CancellationVars {
  offering: string;
  creator: string;
  guest: string;
  start: string;
}

function bodyGuestCancelledGuest(v: CancellationVars, refund: string): string {
  return (
    para(`You cancelled your ${v.offering} session with ${v.creator} that was scheduled for ${v.start}.`) +
    infoBox(refund)
  );
}

function bodyGuestCancelledCreator(v: CancellationVars, compensation: string): string {
  return (
    para(`Your ${v.offering} session with ${v.guest}, scheduled for ${v.start}, was cancelled by the guest.`) +
    infoBox(compensation)
  );
}

function bodyCreatorCancelledGuest(v: CancellationVars, amount: string): string {
  return (
    para(`${v.creator} cancelled your ${v.offering} session that was scheduled for ${v.start}.`) +
    infoBox(`You will receive a full refund of ${amount}.`)
  );
}

function bodyCreatorCancelledCreator(v: CancellationVars): string {
  return para(
    `You cancelled your ${v.offering} session with ${v.guest} that was scheduled for ${v.start}. The guest has been fully refunded.`,
    false,
  );
}

function bodyAdminCancelledGuest(v: CancellationVars, refund: string): string {
  return (
    para(`Your ${v.offering} session with ${v.creator} that was scheduled for ${v.start} was cancelled by Haibu.`) +
    infoBox(refund) +
    smallNote("If you have questions about this, reply to this email and we will help.")
  );
}

function bodyAdminCancelledCreator(v: CancellationVars): string {
  return (
    para(`Your ${v.offering} session with ${v.guest} that was scheduled for ${v.start} was cancelled by Haibu.`) +
    smallNote(
      "If this affects your payout, we will follow up separately with details. Reply to this email if you have questions.",
      false,
    )
  );
}

interface CancellationEmail {
  to: string;
  subject: string;
  title: string;
  heading: string;
  body: string;
}

export function buildCancellationEmails(
  input: CancellationInput,
): CancellationEmail[] {
  const offering = escapeHtml(input.offeringTitle);
  const creatorName = escapeHtml(input.creator.name);
  const guestName = escapeHtml(input.guest.name);
  const guestStart = escapeHtml(
    formatStartTime(input.startAt, input.guest.timezone),
  );
  const creatorStart = escapeHtml(
    formatStartTime(input.startAt, input.creator.timezone),
  );
  const refund = refundText(input.refundPercent, input.priceCents);
  const compensation = compensationText(
    input.refundPercent,
    input.creatorPayoutCents,
  );
  const amount = money(input.priceCents);

  const emails: CancellationEmail[] = [];

  if (input.scenario === "guest_cancelled") {
    emails.push({
      to: input.guest.email,
      subject: `Your session with ${input.creator.name} was cancelled`,
      title: "Your session was cancelled",
      heading: "Your session was cancelled",
      body: bodyGuestCancelledGuest(
        { offering, creator: creatorName, guest: guestName, start: guestStart },
        refund,
      ),
    });
    emails.push({
      to: input.creator.email,
      subject: "A session was cancelled by the guest",
      title: "A session was cancelled",
      heading: "A session was cancelled",
      body: bodyGuestCancelledCreator(
        { offering, creator: creatorName, guest: guestName, start: creatorStart },
        compensation,
      ),
    });
  } else if (input.scenario === "creator_cancelled") {
    emails.push({
      to: input.guest.email,
      subject: `Your session with ${input.creator.name} was cancelled`,
      title: "Your session was cancelled",
      heading: "Your session was cancelled",
      body: bodyCreatorCancelledGuest(
        { offering, creator: creatorName, guest: guestName, start: guestStart },
        amount,
      ),
    });
    emails.push({
      to: input.creator.email,
      subject: "You cancelled a session",
      title: "You cancelled a session",
      heading: "You cancelled a session",
      body: bodyCreatorCancelledCreator({
        offering,
        creator: creatorName,
        guest: guestName,
        start: creatorStart,
      }),
    });
  } else {
    emails.push({
      to: input.guest.email,
      subject: `Your session with ${input.creator.name} was cancelled`,
      title: "Your session was cancelled",
      heading: "Your session was cancelled",
      body: bodyAdminCancelledGuest(
        { offering, creator: creatorName, guest: guestName, start: guestStart },
        refund,
      ),
    });
    emails.push({
      to: input.creator.email,
      subject: "A session was cancelled by Haibu",
      title: "A session was cancelled",
      heading: "A session was cancelled",
      body: bodyAdminCancelledCreator({
        offering,
        creator: creatorName,
        guest: guestName,
        start: creatorStart,
      }),
    });
  }

  return emails;
}

export async function sendCancellationEmails(
  input: CancellationInput,
): Promise<{ sent: number; errors: string[] }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const message =
      "[email] RESEND_API_KEY is not set; cancellation emails skipped";
    console.error(message);
    return { sent: 0, errors: [message] };
  }

  const resend = new Resend(apiKey);
  const emails = buildCancellationEmails(input);
  let sent = 0;
  const errors: string[] = [];

  for (const e of emails) {
    const html = document(e.title, e.heading, e.body);
    try {
      const { data, error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: e.to,
        subject: e.subject,
        html,
      });
      if (error) {
        const message = `[email] failed to send cancellation email for booking ${input.bookingId}: ${error.message}`;
        console.error(message);
        errors.push(message);
      } else {
        console.log(
          `[email] sent cancellation email for booking ${input.bookingId} to ${e.to} (${data?.id ?? "no id"})`,
        );
        sent++;
      }
    } catch (err) {
      const message = `[email] exception sending cancellation email for booking ${input.bookingId}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(message);
      errors.push(message);
    }
  }

  return { sent, errors };
}
