import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <div data-chapter="still" className="frame grid min-h-[80svh] place-items-center text-center">
      <div>
        <p className="display text-5xl">You&rsquo;re offline.</p>
        <p className="mt-4 text-paper-dim">Checks need a connection to reach the exchange records. Your saved checks are still here.</p>
      </div>
    </div>
  );
}
