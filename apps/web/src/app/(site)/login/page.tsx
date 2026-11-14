import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OroMark } from "@/components/brand/oro-mark";
import { AuthForm } from "@/components/site/auth-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export default function LoginPage() {
  return (
    <div data-chapter="page" className="frame grid min-h-[100svh] place-items-center pt-28 pb-16">
      <div className="glass w-full max-w-md rounded-[2rem] p-8">
        <div className="text-center">
          <OroMark className="mx-auto h-14 w-auto" decorative />
          <h1 className="display mt-5 text-4xl">Sign in to ORO.</h1>
          <p className="mt-3 text-paper-dim">Get 10 checks a day, and a Room that shows news about the shares and funds you own.</p>
        </div>
        <div className="mt-7">
          <Suspense fallback={<div className="h-72" />}>
            <AuthForm google={google} />
          </Suspense>
        </div>
        <div className="mt-6 flex justify-center gap-4 text-[0.9rem]">
          <Link href="/room" className="text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
            Try the demo portfolio
          </Link>
          <Link href="/parakh" className="text-paper-dim hover:text-paper">
            Check a tip
          </Link>
        </div>
      </div>
    </div>
  );
}
