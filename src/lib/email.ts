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
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://haibu.live";

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
