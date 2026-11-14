import type { Metadata } from "next";
import { Shelf } from "@/components/assay/shelf";
import { PageHead } from "@/components/site/page-head";

export const metadata: Metadata = { title: "Your past checks", robots: { index: false } };

export default function HistoryPage() {
  return (
    <div data-chapter="assay">
      <PageHead
        eyebrow="Parakh · your shelf"
        title={
          <>
            Your <span className="display-italic text-molten">past checks.</span>
          </>
        }
        lede="Saved in this browser only."
      />
      <section className="frame pb-28">
        <Shelf />
      </section>
    </div>
  );
}
