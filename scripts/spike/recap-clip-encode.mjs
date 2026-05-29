import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let err = "";
    proc.stderr.on("data", (data) => {
      err += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg ${code}\n${err.slice(-1500)}`));
      }
    });
  });
}

async function main() {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");

  const dir = await mkdtemp(join(tmpdir(), "recap-clip-"));
  for (let i = 0; i < 8; i += 1) {
    const hex = Math.round((i / 8) * 0xffffff)
      .toString(16)
      .padStart(6, "0");
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      `color=c=0x${hex}:s=1080x1350`,
      "-frames:v",
      "1",
      "-y",
      join(dir, `frame_${String(i).padStart(4, "0")}.png`),
    ]);
  }

  const out = join(dir, "clip.mp4");
  const t0 = Date.now();
  await runFfmpeg([
    "-framerate",
    "3",
    "-i",
    join(dir, "frame_%04d.png"),
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.0",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale=1080:1350,fps=30",
    "-movflags",
    "+faststart",
    "-y",
    out,
  ]);

  const encodeMs = Date.now() - t0;
  const { size } = await stat(out);
  console.log(JSON.stringify({ outDir: dir, encodeMs, mp4Bytes: size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
