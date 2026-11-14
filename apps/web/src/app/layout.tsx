import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { FieldRoot } from "@/components/field/field-root";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { SwRegister } from "@/components/site/sw-register";
import "./globals.css";

// Fonts ship with the repo (latin subsets of the Google Fonts variable files) so builds never
// depend on reaching fonts.googleapis.com; a timeout there once failed a production deploy.
const geist = localFont({ src: "../fonts/geist-latin.woff2", variable: "--font-geist", weight: "100 900" });
const geistMono = localFont({ src: "../fonts/geist-mono-latin.woff2", variable: "--font-geist-mono", weight: "100 900" });
const fraunces = localFont({
  src: [
    { path: "../fonts/fraunces-latin.woff2", style: "normal", weight: "100 900" },
    { path: "../fonts/fraunces-italic-latin.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-fraunces",
});
// Hindi/Hinglish tips can contain Devanagari; not preloaded.
const devanagari = localFont({ src: "../fonts/noto-devanagari.woff2", variable: "--font-devanagari", weight: "100 900", preload: false });

const THEME_BOOT = `try{var t=localStorage.getItem("oro.theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "ORO: check any stock tip against the records",
    template: "%s · ORO",
  },
  description:
    "Paste a stock tip from WhatsApp or Telegram. ORO checks it against BSE and NSE filings and SEBI records, flags scam patterns, and shows which parts hold up. It never tells you what to buy or sell.",
  applicationName: "ORO",
  openGraph: { siteName: "ORO", type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#070A11",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${geist.variable} ${geistMono.variable} ${fraunces.variable} ${devanagari.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a saved light/dark choice before first paint, so the page never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="grain relative min-h-dvh">
        <a
          href="#main"
          className="sr-only z-[100] rounded-full bg-gold px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <FieldRoot />
        <SmoothScroll />
        <SwRegister />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
