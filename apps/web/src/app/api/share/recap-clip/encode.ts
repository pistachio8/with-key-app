import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Beat } from "./storyboard";

// scripts/copy-ffmpeg.mjs 가 빌드 시 ffmpeg-static 바이너리를 symlink 밖 실경로로 복사한다.
// node_modules 의 pnpm symlink 를 함수 번들에 넣으면 Vercel 이 거부하므로,
// 런타임에는 복사된 실파일(process.cwd()/bin/ffmpeg)을 직접 spawn 한다.
const ffmpegPath = join(process.cwd(), "bin", "ffmpeg");

export interface EncodeInput {
  beats: Beat[];
  pngs: Buffer[];
  fps: number;
}

export async function encodeClip(input: EncodeInput): Promise<Buffer> {
  if (!existsSync(ffmpegPath)) {
    throw new Error(`ffmpeg binary not found at ${ffmpegPath} (run scripts/copy-ffmpeg.mjs)`);
  }
  if (input.beats.length !== input.pngs.length) {
    throw new Error("beat/png length mismatch");
  }
  if (input.pngs.length === 0) {
    throw new Error("at least one keyframe is required");
  }

  const dir = await mkdtemp(join(tmpdir(), "recap-clip-"));
  try {
    const lines: string[] = [];
    for (let i = 0; i < input.pngs.length; i += 1) {
      const framePath = join(dir, `k_${String(i).padStart(3, "0")}.png`);
      await writeFile(framePath, input.pngs[i]);
      lines.push(
        `file '${framePath}'`,
        `duration ${(input.beats[i].frames / input.fps).toFixed(3)}`,
      );
    }

    const lastFramePath = join(dir, `k_${String(input.pngs.length - 1).padStart(3, "0")}.png`);
    lines.push(`file '${lastFramePath}'`);

    const listPath = join(dir, "list.txt");
    const outPath = join(dir, "clip.mp4");
    await writeFile(listPath, lines.join("\n"));
    await runFfmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vsync",
      "vfr",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "3.0",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      `scale=1080:1350,fps=${input.fps}`,
      "-movflags",
      "+faststart",
      "-y",
      outPath,
    ]);

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let err = "";
    proc.stderr.on("data", (data) => {
      err += data.toString();
    });
    proc.on("error", (error) => {
      reject(error);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`));
      }
    });
  });
}
