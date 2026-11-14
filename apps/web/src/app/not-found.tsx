import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" data-chapter="still" className="frame grid min-h-[100svh] place-items-center text-center">
      <div>
        <p className="eyebrow">404 · Unverified</p>
        <h1 className="display mt-4 text-[clamp(3rem,9vw,7rem)] tracking-[-0.03em]">
          No record of <span className="display-italic text-molten">that page.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-paper-dim">Like a tip with no filing behind it. Head back to something we can vouch for.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="btn btn-gold">
            Home
          </Link>
          <Link href="/parakh" className="btn btn-ghost">
            Check a tip
          </Link>
        </div>
      </div>
    </main>
  );
}
