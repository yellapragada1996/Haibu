import { NextResponse } from "next/server";
import { markdownToHtml } from "@/lib/markdown";
import { TERMS_OF_SERVICE_MARKDOWN } from "@/content/terms-of-service";

// Strips non-user-facing artifacts (title, draft notice, last-updated
// placeholder, and the Contents jump-list) so the modal renders a clean,
// continuous document.
function prepareTermsMarkdown(markdown: string): string {
  let out = markdown;
  // Draft-notice blockquote lines.
  out = out
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n");
  // Document title (the modal already shows "Terms of Service").
  out = out.replace(/^# Haibu — Terms of Service[^\n]*\n*/, "");
  // Last-updated placeholder.
  out = out.replace(/\*\*Last updated:.*?\*\*\s*\n*/, "");
  // Contents jump-list (Part 1–5) and its trailing rule.
  out = out.replace(/\*\*Contents\*\*[\s\S]*?---\s*\n/, "");
  return out.trim();
}

export async function GET() {
  const html = markdownToHtml(prepareTermsMarkdown(TERMS_OF_SERVICE_MARKDOWN));
  return NextResponse.json({ html });
}
