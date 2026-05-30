export type BeatKind = "intro" | "photo" | "endcard";

export interface Beat {
  kind: BeatKind;
  photoIndex?: number;
  frames: number;
}

export interface Storyboard {
  beats: Beat[];
  fps: number;
  totalFrames: number;
  totalSeconds: number;
}

export const MAX_MONTAGE = 6;
const INTRO_SEC = 0.4;
const ENDCARD_SEC = 0.8;
const MONTAGE_SEC = 1.8;

export function buildStoryboard(input: { photoCount: number; fps: number }): Storyboard {
  const fps = Math.max(1, Math.floor(input.fps));
  const photoCount = Math.min(Math.max(input.photoCount, 0), MAX_MONTAGE);
  const beats: Beat[] = [{ kind: "intro", frames: Math.round(INTRO_SEC * fps) }];

  if (photoCount > 0) {
    const framesPerPhoto = Math.round((MONTAGE_SEC / photoCount) * fps);
    for (let i = 0; i < photoCount; i += 1) {
      beats.push({ kind: "photo", photoIndex: i, frames: framesPerPhoto });
    }
  }

  beats.push({ kind: "endcard", frames: Math.round(ENDCARD_SEC * fps) });

  const totalFrames = beats.reduce((sum, beat) => sum + beat.frames, 0);
  return {
    beats,
    fps,
    totalFrames,
    totalSeconds: totalFrames / fps,
  };
}
