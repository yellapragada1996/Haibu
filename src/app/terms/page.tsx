import { PublicLayout } from "@/components/layout/PublicLayout";
import { TERMS_OF_SERVICE_MARKDOWN } from "@/content/terms-of-service";
import { markdownToHtml } from "@/lib/markdown";

const termsHtml = markdownToHtml(TERMS_OF_SERVICE_MARKDOWN);

export default function TermsPage() {
  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:py-10">
        <style>{`
          .terms-prose { color: #8A8A8A; font-size: 0.9rem; line-height: 1.7; }
          .terms-prose h1 { font-size: 1.75rem; font-weight: 700; color: #fff; line-height: 1.25; margin-bottom: 0.5rem; }
          .terms-prose h2 { font-size: 1.3rem; font-weight: 700; color: #fff; margin-top: 2.25rem; margin-bottom: 0.5rem; }
          .terms-prose h3 { font-size: 1.05rem; font-weight: 600; color: #fff; margin-top: 1.5rem; margin-bottom: 0.4rem; }
          .terms-prose p { margin-bottom: 0.9rem; }
          .terms-prose ul { margin-bottom: 1rem; padding-left: 1.25rem; }
          .terms-prose li { margin-bottom: 0.3rem; }
          .terms-prose a { color: #fff; text-decoration: underline; }
          .terms-prose strong { color: #fff; }
          .terms-prose code { background: #1E1E1E; padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
          .terms-prose hr { border: none; border-top: 1px solid #2A2A2A; margin: 1.75rem 0; }
          .terms-prose table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.85rem; }
          .terms-prose th, .terms-prose td { border: 1px solid #2A2A2A; padding: 0.55rem 0.75rem; text-align: left; vertical-align: top; }
          .terms-prose th { color: #fff; font-weight: 600; background: #1A1A1A; }
          .terms-prose blockquote { border-left: 2px solid #2A2A2A; padding-left: 1rem; margin: 0 0 1rem; }
        `}</style>
        <div
          className="terms-prose"
          dangerouslySetInnerHTML={{ __html: termsHtml }}
        />
      </main>
    </PublicLayout>
  );
}
