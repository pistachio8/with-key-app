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
  // Phase 1b-3 — Next.js 16 Cache Components 활성화. plan v4 §Phase 1b-3.
  // Phase 1b-2a/1b-2b 에서 모든 (app)·(auth)·(flow) page/layout 의 dynamic
  // API 호출을 Suspense 안의 *Section 자식으로 격리 완료. 본 활성화로
  // (a) <Activity hidden> navigation state 보존, (b) Partial Prerender (정적
  // 셸 + dynamic streaming), (c) 'use cache' · 'use cache: private' 디렉티브
  // 사용 가능 — 단 신규 캐시 도입은 Phase 3·4 에서.
  cacheComponents: true,
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
