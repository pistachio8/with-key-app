// 스크린샷 휴리스틱(순수·결정론). I/O 없음 — EXIF 신호 + 해상도 시그니처만 본다.
//
// 신호 발화 조건: 카메라 EXIF 부재 AND 이미지 크기가 알려진 단말 풀스크린 캡처 해상도와 일치.
// 둘 다 요구하는 이유: 클라(prepareForUpload)가 Canvas 재인코딩으로 EXIF 를 제거하므로
//   "카메라 EXIF 부재"는 정상 사진에서도 흔하다 — 해상도 일치가 스크린샷을 가르는 discriminator.
// 단독 차단은 하지 않는다(false-flag-threshold-theta spec: screenshotSignal=review_only).

/** 단말 풀스크린 캡처 해상도(세로 기준 [짧은 변, 긴 변]) — iOS·Android 대표 라인. */
const SCREEN_RESOLUTIONS: ReadonlyArray<readonly [number, number]> = [
  [750, 1334], // iPhone SE2/6/7/8
  [828, 1792], // iPhone XR/11
  [1080, 1920], // FHD Android
  [1080, 2340], // 19.5:9 Android
  [1080, 2400], // 20:9 Android
  [1125, 2436], // iPhone X/XS/11 Pro
  [1170, 2532], // iPhone 12/13/14
  [1179, 2556], // iPhone 14 Pro/15
  [1242, 2688], // iPhone XS Max/11 Pro Max
  [1284, 2778], // iPhone 12/13 Pro Max
  [1290, 2796], // iPhone 14 Pro Max/15 Pro Max
  [1440, 3120], // QHD Android
];

export interface ScreenshotInput {
  /** 카메라 EXIF(Make/Model) 존재 여부. */
  cameraExifPresent: boolean;
  /** EXIF 블록 자체 존재 여부. */
  exifPresent: boolean;
  width: number | null;
  height: number | null;
}

export interface ScreenshotSignal {
  /** 스크린샷 의심(카메라 EXIF 부재 AND 단말 해상도 일치). */
  suspected: boolean;
  /** 개별 신호 플래그(EVAL-0022 가 advisory 로 활용). */
  reasons: string[];
}

function matchesDeviceResolution(width: number, height: number): boolean {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  return SCREEN_RESOLUTIONS.some(([s, l]) => s === short && l === long);
}

/** 결정론 스크린샷 신호. 동일 입력 → 동일 출력. */
export function detectScreenshot(input: ScreenshotInput): ScreenshotSignal {
  const reasons: string[] = [];

  const noCameraExif = !input.cameraExifPresent;
  if (noCameraExif) reasons.push("no-camera-exif");
  if (!input.exifPresent) reasons.push("no-exif-block");

  const dimensionMatch =
    input.width != null &&
    input.height != null &&
    matchesDeviceResolution(input.width, input.height);
  if (dimensionMatch) reasons.push("device-screen-dimensions");

  return { suspected: noCameraExif && dimensionMatch, reasons };
}
