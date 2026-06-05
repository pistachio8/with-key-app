import "server-only";
import sharp from "sharp";

/**
 * 티켓형 사진을 네이비 듀오톤으로 변환해 data URI로 반환한다.
 * 실패하면 null을 반환하고 호출부는 플레이스홀더를 렌더한다.
 */
export async function duotoneDataUrl(signedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const out = await sharp(input)
      .resize(760, 1924, { fit: "cover" })
      .grayscale()
      .tint({ r: 0x2a, g: 0x38, b: 0x55 })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
