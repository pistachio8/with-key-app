import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fontCache: Record<string, ArrayBuffer | null> = {};

async function loadFont(file: string): Promise<ArrayBuffer | null> {
  if (file in fontCache) return fontCache[file];

  try {
    const buf = await readFile(path.join(process.cwd(), "public/fonts", file));
    fontCache[file] = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } catch {
    fontCache[file] = null;
  }

  return fontCache[file];
}

type Font = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

// satori(next/og)는 woff2 를 파싱하지 못한다("Unsupported OpenType signature wOF2").
// 그래서 Pretendard 는 정적 OTF(Regular 400 · Bold 700)로 로드한다. Anton 은 ttf 라 그대로.
export async function loadCardFonts(): Promise<Font[]> {
  const [pretendardRegular, pretendardBold, anton] = await Promise.all([
    loadFont("Pretendard-Regular.otf"),
    loadFont("Pretendard-Bold.otf"),
    loadFont("Anton-Regular.ttf"),
  ]);

  return [
    pretendardRegular
      ? {
          name: "Pretendard",
          data: pretendardRegular,
          weight: 400 as const,
          style: "normal" as const,
        }
      : null,
    pretendardBold
      ? { name: "Pretendard", data: pretendardBold, weight: 700 as const, style: "normal" as const }
      : null,
    anton ? { name: "Anton", data: anton, weight: 400 as const, style: "normal" as const } : null,
  ].filter((font): font is Font => font !== null);
}
