// scripts/copy-ffmpeg.mjs
//
// ffmpeg-static 바이너리를 pnpm symlink(node_modules/ffmpeg-static -> .pnpm/...) 밖의
// 실경로(./bin/ffmpeg)로 복사한다. next.config.ts 의 outputFileTracingIncludes 가
// symlink 디렉터리를 따라가 파일을 함수 번들에 넣으면 Vercel 이
// "invalid deployment package (symlinked directories)" 로 패키징을 거부하기 때문.
// package.json 의 "build" 가 next build 직전에 이 스크립트를 실행한다.

import { chmodSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";

// ffmpeg-static default export = 플랫폼 바이너리의 절대 경로(postinstall 이 받아둔 실제 파일).
const src = ffmpegStatic;
if (!src) {
  console.error("[copy-ffmpeg] ffmpeg-static path is null — postinstall 설치 실패 가능성");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "bin");
const dest = join(destDir, "ffmpeg");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest); // symlink 가 아닌 실제 파일 내용 복사
chmodSync(dest, 0o755); // 실행 권한

const { size } = statSync(dest);
console.log(`[copy-ffmpeg] ${src} -> ${dest} (${(size / 1048576).toFixed(1)} MB, 0755)`);
