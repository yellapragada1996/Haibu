import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PostHogProvider } from "@/components/PostHogProvider";
import { PostHogPageview } from "@/components/PostHogPageview";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Haibu — Book 1-on-1 Live Video Sessions with Creators",
    template: "%s | Haibu",
  },
  description:
    "Book live 1-on-1 video sessions with your favorite creators. ASMR, coaching, music lessons, tarot readings and more.",
  metadataBase: new URL("https://haibu.live"),
  openGraph: {
    title: "Haibu — Book 1-on-1 Live Video Sessions with Creators",
    description:
      "Book live 1-on-1 video sessions with your favorite creators. ASMR, coaching, music lessons, tarot readings and more.",
    url: "https://haibu.live",
    siteName: "Haibu",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Haibu — Book 1-on-1 Live Video Sessions with Creators",
    description:
      "Book live 1-on-1 video sessions with your favorite creators.",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("haibu-theme");if(t==="light"||t==="dark"){document.documentElement.className=t;document.documentElement.setAttribute("data-theme",t)}}catch(e){}` }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","ydpl20dgdw")` }} />
      </head>
      <body className="bg-bg-base text-text-primary antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  name: "Haibu",
                  url: "https://haibu.live",
                  description:
                    "Book live 1-on-1 video sessions with your favorite creators. ASMR, coaching, music lessons, tarot readings and more.",
                },
                {
                  "@type": "Organization",
                  name: "Haibu",
                  url: "https://haibu.live",
                  sameAs: [
                    "https://www.instagram.com/haibu.live/",
                  ],
                },
              ],
            }),
          }}
        />
        <PostHogProvider>
          <Suspense fallback={null}>
            <PostHogPageview />
          </Suspense>
          <ThemeProvider>{children}</ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
