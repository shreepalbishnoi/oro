import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Self-contained server for the Docker image (PLAN §4: self-hosted on the VM).
  output: "standalone",
  turbopack: {
    rules: {
      // Only the global stylesheet needs Tailwind. Matching every *.css here would also
      // re-type *.module.css as plain CSS and strip CSS Module class mappings.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
