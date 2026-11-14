import type { MetadataRoute } from "next";

/** PWA manifest. share_target puts ORO in Android's share sheet: share a WhatsApp message → a check starts. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ORO: check any stock tip",
    short_name: "ORO",
    description: "Hold every stock tip to the light. Claims checked against exchange filings and SEBI records.",
    start_url: "/parakh?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#070A11",
    theme_color: "#070A11",
    orientation: "portrait",
    categories: ["finance", "news", "utilities"],
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/parakh",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
    shortcuts: [
      { name: "Check a tip", url: "/parakh" },
      { name: "My Room", url: "/room" },
    ],
  };
}
