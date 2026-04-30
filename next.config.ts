import type { NextConfig } from "next";

// D-018 requires raising bodySizeLimit so 5MB photos don't 413 before the
// Server Action can inspect them. In Next 16 the NextConfig type still
// nests this under `experimental` — plain top-level `serverActions` fails
// typecheck. Revisit when upstream promotes the key out of experimental.
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
