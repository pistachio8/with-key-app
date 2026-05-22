import type { NextConfig } from "next";

// D-018 requires raising bodySizeLimit so 5MB photos don't 413 before the
// Server Action can inspect them. In Next 16 the NextConfig type still
// nests this under `experimental` — plain top-level `serverActions` fails
// typecheck. Revisit when upstream promotes the key out of experimental.

// PhotoGallery uses next/image with Supabase signed URLs.
// Extract hostname dynamically so the config works across projects.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co")
      .hostname;
  } catch {
    return "placeholder.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: supabaseHost,
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
};

export default nextConfig;
