import "server-only";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Beat } from "./storyboard";

export interface EncodeInput {
  beats: Beat[];
  pngs: Buffer[];
  fps: number;
}

export async function encodeClip(input: EncodeInput): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");
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
    const proc = spawn(ffmpegPath as string, args);
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
