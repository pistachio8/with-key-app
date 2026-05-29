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

export async function loadCardFonts(): Promise<Font[]> {
  const [pretendard, anton] = await Promise.all([
    loadFont("PretendardVariable.woff2"),
    loadFont("Anton-Regular.ttf"),
  ]);

  return [
    pretendard
      ? { name: "Pretendard", data: pretendard, weight: 400 as const, style: "normal" as const }
      : null,
    pretendard
      ? { name: "Pretendard", data: pretendard, weight: 700 as const, style: "normal" as const }
      : null,
    anton ? { name: "Anton", data: anton, weight: 400 as const, style: "normal" as const } : null,
  ].filter((font): font is Font => font !== null);
}
