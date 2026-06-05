// PWA 아이콘 생성 — public/logo-from-with.svg를 흰 배경 정사각 PNG로 렌더.
// 산출물: icon-192 / icon-512 / icon-512-maskable / apple-touch-icon-180.
// 실행: pnpm icons:pwa
//
// safePct는 정사각 캔버스 안에서 로고가 차지할 가로 비율.
// maskable은 Android 적응형 마스크 safe zone(중앙 80%) 고려해 더 작게.
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const svgPath = resolve(repoRoot, "public/logo-from-with.svg");
const outDir = resolve(repoRoot, "public/icons");

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function makeIcon({ size, safePct, outName }) {
  const svg = await readFile(svgPath);
  const targetWidth = Math.round(size * safePct);
  const resized = await sharp(svg, { density: 384 })
    .resize({ width: targetWidth })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const top = Math.max(0, Math.round((size - meta.height) / 2));
  const left = Math.max(0, Math.round((size - meta.width) / 2));

  await sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([{ input: resized, top, left }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(outDir, outName));

  console.log(`✓ ${outName} (${size}x${size}, logo ${targetWidth}x${meta.height})`);
}

await mkdir(outDir, { recursive: true });

await makeIcon({ size: 192, safePct: 0.86, outName: "icon-192.png" });
await makeIcon({ size: 512, safePct: 0.86, outName: "icon-512.png" });
await makeIcon({ size: 512, safePct: 0.7, outName: "icon-512-maskable.png" });
await makeIcon({ size: 180, safePct: 0.86, outName: "apple-touch-icon-180.png" });
